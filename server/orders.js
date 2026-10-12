'use strict';
const crypto=require('node:crypto'),rateLimit=require('express-rate-limit');
const settings=require('./checkout-settings.json');
const uuid=s=>typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
function fail(message,status=400){const e=Error(message);e.status=status;throw e;}
function normalizeItems(items){
 if(!Array.isArray(items)||items.length===0||items.length>50)fail('Your bag must contain between 1 and 50 products.');
 const seen=new Set();
 return items.map(x=>{if(!x||!uuid(x.id)||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>99||seen.has(x.id))fail('Invalid bag quantity or product.');seen.add(x.id);return {id:x.id,quantity:x.quantity};}).sort((a,b)=>a.id.localeCompare(b.id));
}
function customerFrom(raw,method){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Enter your contact details.');
 const text=(key,min,max)=>{const value=raw[key];if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||/[\x00-\x1f]/.test(value))fail('Check your '+key+'.');return value.trim();};
 const result={name:text('name',2,100),email:text('email',5,254).toLowerCase(),phone:text('phone',7,24)};
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)||!/^\+?[\d ()-]{7,24}$/.test(result.phone))fail('Enter a valid email and phone number.');
 if(method==='delivery')Object.assign(result,{address:text('address',5,250),city:text('city',2,100),province:text('province',2,100),postalCode:text('postalCode',4,4),country:'South Africa'});
 if(method==='delivery'&&!/^\d{4}$/.test(result.postalCode))fail('Enter a four-digit South African postal code.');
 return result;
}
function methodFrom(value){if(!['collection','delivery'].includes(value))fail('Choose collection or delivery.');return value;}
function checkoutOpen(){return process.env.NODE_ENV!=='production'||(process.env.CHECKOUT_ENABLED==='true'&&process.env.POLICIES_APPROVED==='true');}
function quoteFrom(rows,items,method){
 const byId=new Map(rows.map(p=>[p.id,p]));
 const lines=items.map(item=>{const p=byId.get(item.id);if(!p||!p.is_published)fail('An item is no longer available. Remove it from your bag.',409);if(p.stock<item.quantity)fail(p.name+' has insufficient stock. Update your bag.',409);return {id:p.id,name:p.name,variant:p.card_metadata?.marketVariant||'',number:p.card_number,set:p.set_name,imageUrl:p.image_url,quantity:item.quantity,unitCents:p.price_cents,lineCents:p.price_cents*item.quantity};});
 const subtotalCents=lines.reduce((sum,i)=>sum+i.lineCents,0),deliveryCents=method==='delivery'?settings.deliveryFeeCents:0,totalCents=subtotalCents+deliveryCents;
 if(!Number.isSafeInteger(totalCents)||totalCents>1000000000)fail('Order value is too large. Please contact us.');
 return {items:lines,subtotalCents,deliveryCents,totalCents,currency:'ZAR'};
}
function mountOrders(app,pool,auth,csrf,token,requireCustomer,payments=require('./payments').createPayments()){
 if(!Number.isSafeInteger(settings.deliveryFeeCents)||settings.deliveryFeeCents<0)throw Error('Invalid delivery fee');
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(!e.status)console.error('Order request failed:',e.code||'internal');res.status(e.status||500).json({error:e.status?e.message:'Unable to process this request. Please try again.'});}};
 const selectProducts='SELECT id,name,card_number,set_name,image_url,price_cents,stock,is_published,card_metadata FROM products WHERE id=ANY($1::uuid[]) ORDER BY id';
 const receipt=o=>({reference:o.reference,status:o.status,totalCents:o.total_cents,fulfilment:o.fulfilment,paymentMethod:o.payment_method||'eft',collectionArea:settings.collectionArea,eftInstructions:(!o.payment_method||o.payment_method==='eft')?settings.eftInstructions:undefined});
 app.get('/api/checkout/config',(req,res)=>{const {eftInstructions,...publicSettings}=settings;res.set('Cache-Control','no-store').json({...publicSettings,checkoutOpen:checkoutOpen(),paymentMethod:'EFT',paymentMethods:payments.methods(),paymentEnvironment:payments.mode||'sandbox',currency:'ZAR'});});
 app.get('/api/account/orders',requireCustomer,wrap(async(req,res)=>{
   const result=await pool.query('SELECT reference,status,fulfilment,items,total_cents AS "totalCents",payment_method AS "paymentMethod",created_at AS "createdAt" FROM orders WHERE customer_id=$1 ORDER BY created_at DESC',[req.customer.id]);
   res.set('Cache-Control','private, no-store').json({orders:result.rows});
 }));
 app.get('/api/orders/:reference',requireCustomer,wrap(async(req,res)=>{
   const result=await pool.query('SELECT * FROM orders WHERE reference=$1 AND customer_id=$2',[req.params.reference,req.customer.id]);
   if(!result.rowCount)fail('Order not found.',404);
   res.set('Cache-Control','private, no-store').json(receipt(result.rows[0]));
 }));
 app.post('/api/orders/:reference/payment',csrf,requireCustomer,wrap(async(req,res)=>{
   const db=await pool.connect();
   try{
     await db.query('BEGIN');
     const result=await db.query('SELECT * FROM orders WHERE reference=$1 AND customer_id=$2 FOR UPDATE',[req.params.reference,req.customer.id]);
     if(!result.rowCount)fail('Order not found.',404);
     const order=result.rows[0];
     if(order.status!=='pending_payment'||order.payment_method==='eft')fail('This order does not need online payment.',409);
     const checkout=order.payment_checkout||await payments.start(order);
     if(!order.payment_checkout)await db.query('UPDATE orders SET payment_checkout=$2,updated_at=now() WHERE id=$1',[order.id,JSON.stringify(checkout)]);
     await db.query('COMMIT');res.set('Cache-Control','private, no-store').json(checkout);
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }));
 app.post('/api/checkout/quote',csrf,wrap(async(req,res)=>{
   const items=normalizeItems(req.body?.items),method=methodFrom(req.body?.fulfilment);
   const found=await pool.query(selectProducts,[items.map(x=>x.id)]);res.set('Cache-Control','no-store').json(quoteFrom(found.rows,items,method));
 }));
 const limit=require('./rate-limiter').limiter(pool,'orders',{windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many order attempts. Please wait before trying again.'}});
 app.post('/api/orders',limit,csrf,requireCustomer,wrap(async(req,res)=>{
   if(!checkoutOpen())return res.status(503).json({code:'CHECKOUT_CLOSED',error:'Checkout is not open yet. Please contact support.'});
   const items=normalizeItems(req.body?.items),method=methodFrom(req.body?.fulfilment),customer=customerFrom({...req.body?.customer,...req.customer.profile},method);
   const key=req.get('Idempotency-Key');if(!uuid(key))fail('Refresh checkout before trying again.');
   if(!Number.isSafeInteger(req.body.expectedTotalCents))fail('Review your order total first.');
   const paymentMethod=payments.requireMethod(req.body.paymentMethod||'eft');
   const requestHash=crypto.createHash('sha256').update(JSON.stringify({items,method,customerId:req.customer.id,address:method==='delivery'?{address:customer.address,city:customer.city,province:customer.province,postalCode:customer.postalCode}:null,total:req.body.expectedTotalCents,...(paymentMethod==='eft'?{}:{paymentMethod})})).digest('hex');
   const db=await pool.connect();
   try{
     await db.query('BEGIN');
     await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
     const existing=await db.query('SELECT * FROM orders WHERE idempotency_key=$1',[key]);
     if(existing.rowCount){if(existing.rows[0].request_hash!==requestHash)fail('This order attempt has changed. Refresh and review checkout.',409);await db.query('COMMIT');return res.json(receipt(existing.rows[0]));}
     const found=await db.query(selectProducts+' FOR UPDATE',[items.map(x=>x.id)]),quote=quoteFrom(found.rows,items,method);
     if(quote.totalCents!==req.body.expectedTotalCents)fail('A price changed. Review the updated total before placing your order.',409);
     if(paymentMethod!=='eft'&&quote.totalCents<100)fail('Online payment requires an order total of at least R1. Choose EFT for this order.');
     const id=crypto.randomUUID(),reference='PM-'+crypto.randomBytes(10).toString('hex').toUpperCase();
     for(const item of items)await db.query('UPDATE products SET stock=stock-$2,updated_at=now() WHERE id=$1',[item.id,item.quantity]);
     const result=await db.query('INSERT INTO orders(id,reference,idempotency_key,request_hash,customer,fulfilment,items,subtotal_cents,delivery_cents,total_cents,customer_id,payment_method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[id,reference,key,requestHash,JSON.stringify(customer),method,JSON.stringify(quote.items),quote.subtotalCents,quote.deliveryCents,quote.totalCents,req.customer.id,paymentMethod]);
     await db.query('COMMIT');res.status(201).set('Cache-Control','no-store').json(receipt(result.rows[0]));
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }));
 app.get('/api/admin/orders',auth,wrap(async(req,res)=>{
   const rows=await pool.query('SELECT id,reference,customer,fulfilment,items,payment_method AS "paymentMethod",payment_transaction AS "paymentTransaction",subtotal_cents AS "subtotalCents",delivery_cents AS "deliveryCents",total_cents AS "totalCents",status,created_at AS "createdAt" FROM orders ORDER BY created_at DESC LIMIT 200');res.set('Cache-Control','private, no-store').json(rows.rows);
 }));
 app.patch('/api/admin/orders/:id',csrf,auth,token,wrap(async(req,res)=>{
   if(!uuid(req.params.id))fail('Order not found.',404);
   const next=req.body?.status;if(!['paid','fulfilled','cancelled'].includes(next))fail('Invalid order status.');
   const db=await pool.connect();
   try{
     await db.query('BEGIN');const result=await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[req.params.id]);if(!result.rowCount)fail('Order not found.',404);const order=result.rows[0];
     if(order.status!==next){
       if(order.payment_method&&order.payment_method!=='eft'&&order.status==='pending_payment')fail('Online payment orders must be reconciled with the provider before cancellation; payment is confirmed automatically.',409);
       if(!((order.status==='pending_payment'&&['paid','cancelled'].includes(next))||(order.status==='paid'&&next==='fulfilled')))fail('This status change is not allowed. Paid orders require a separate refund process.',409);
       if(next==='cancelled')for(const item of [...order.items].sort((a,b)=>a.id.localeCompare(b.id)))await db.query('UPDATE products SET stock=stock+$2,updated_at=now() WHERE id=$1',[item.id,item.quantity]);
       await db.query('UPDATE orders SET status=$2,updated_at=now() WHERE id=$1',[order.id,next]);
     }
     await db.query('COMMIT');res.json({ok:true,status:next});
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }));
}
module.exports={mountOrders,normalizeItems,customerFrom,quoteFrom};
