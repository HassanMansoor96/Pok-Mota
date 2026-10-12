'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express');
const {createPayments,mountPaymentWebhooks,payfastSignature,payfastString,stripeSignature}=require('../server/payments');
const {mountOrders}=require('../server/orders');
const env={PUBLIC_ORIGIN:'https://shop.example.com',PAYFAST_MERCHANT_ID:'10000100',PAYFAST_MERCHANT_KEY:'merchant-key',PAYFAST_PASSPHRASE:'test phrase',PAYFAST_SANDBOX:'true',PAYSTACK_SECRET_KEY:'sk_test_example',STRIPE_SECRET_KEY:'sk_test_example',STRIPE_WEBHOOK_SECRET:'whsec_example'};
const order={id:crypto.randomUUID(),reference:'PM-0123456789ABCDEF0123',customer_id:crypto.randomUUID(),customer:{email:'buyer@example.com'},payment_method:'stripe',status:'pending_payment',total_cents:10000,created_at:new Date().toISOString()};
const signed=(body,secret=env.STRIPE_WEBHOOK_SECRET,t=Math.floor(Date.now()/1000))=>'t='+t+',v1='+crypto.createHmac('sha256',secret).update(t+'.'+body).digest('hex');
test('only fully configured providers are advertised; secrets are never exposed',()=>{
 assert.deepEqual(createPayments({}).methods(),[{id:'eft',label:'Bank transfer (EFT)'}]);
 assert.equal(createPayments(env).methods().length,4);
 assert.equal(createPayments({...env,PUBLIC_ORIGIN:'http://shop.example.com',NODE_ENV:'production'}).methods().length,1);
 assert.throws(()=>createPayments({}).requireMethod('stripe'));
 assert.throws(()=>createPayments(env).requireMethod('__proto__'));
 assert.ok(!JSON.stringify(createPayments(env).methods()).includes('sk_test'));
});
test('Stripe rejects altered, stale, missing and incorrect signatures',()=>{
 const raw=Buffer.from('{"test":true}');const header=signed(raw);
 assert.equal(stripeSignature(raw,header,env.STRIPE_WEBHOOK_SECRET),true);
 assert.equal(stripeSignature(Buffer.from('{}'),header,env.STRIPE_WEBHOOK_SECRET),false);
 assert.equal(stripeSignature(raw,signed(raw,env.STRIPE_WEBHOOK_SECRET,1),env.STRIPE_WEBHOOK_SECRET),false);
 assert.equal(stripeSignature(raw,'',env.STRIPE_WEBHOOK_SECRET),false);
});
test('PayFast fields preserve prescribed order, encode spaces and sign without exposing passphrase',async()=>{
 const p=createPayments(env);const checkout=await p.start({...order,payment_method:'payfast'});
 assert.equal(checkout.url,'https://sandbox.payfast.co.za/eng/process');assert.equal(checkout.fields.amount,'100.00');
 assert.equal(checkout.fields.signature,payfastSignature(checkout.fields,env.PAYFAST_PASSPHRASE));
 assert.ok(!JSON.stringify(checkout).includes(env.PAYFAST_PASSPHRASE));
 assert.equal(payfastString({a:" !*'() ",b:'',signature:'skip'}),'a=%21%2A%27%28%29');
 assert.equal(payfastString({a:'hello world'}),'a=hello+world');
 assert.equal(payfastString({a:'~'}),'a=%7E');
});
test('Stripe initialization uses persisted totals, order idempotency and safe hosted URL',async()=>{
 let call;const p=createPayments(env,async(url,options)=>{call={url,options};return {ok:true,json:async()=>({id:'cs_test',url:'https://checkout.stripe.com/c/pay/cs_test'})};});
 assert.equal((await p.start(order)).id,'cs_test');assert.equal(call.options.headers['Idempotency-Key'],order.reference);
 const body=new URLSearchParams(call.options.body);assert.equal(body.get('line_items[0][price_data][unit_amount]'),'10000');assert.equal(body.get('client_reference_id'),order.reference);
 const malicious=createPayments(env,async()=>({ok:true,json:async()=>({id:'cs_test',url:'https://evil.example/pay'})}));
 await assert.rejects(()=>malicious.start(order),{status:502});
 await assert.rejects(()=>p.start({...order,created_at:'2020-01-01'}),{status:409});
});
test('Paystack initializes ZAR cents and refuses a second existing transaction',async()=>{
 let init;const fetcher=async(url,options)=>url.includes('/verify/')?{ok:false,status:404}:{ok:true,json:async()=>{init=JSON.parse(options.body);return {status:true,data:{reference:order.reference,authorization_url:'https://checkout.paystack.com/test'}};}};
 assert.equal((await createPayments(env,fetcher).start({...order,payment_method:'paystack'})).id,order.reference);
 assert.equal(init.amount,10000);assert.equal(init.currency,'ZAR');
 const p=createPayments(env,async()=>({ok:true,json:async()=>({status:true,data:{reference:order.reference,amount:10000,currency:'ZAR',status:'pending'}})}));
 await assert.rejects(()=>p.start({...order,payment_method:'paystack'}),{status:409});
});
test('Paystack notifications require a signature over the exact raw bytes',async()=>{
 const p=createPayments(env),raw=Buffer.from(JSON.stringify({event:'charge.success',data:{domain:'test',status:'success',reference:order.reference,amount:10000,currency:'ZAR',id:42}}));
 const signature=crypto.createHmac('sha512',env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
 assert.equal((await p.notification('paystack',{body:raw,get:()=>signature})).transaction,'42');
 await assert.rejects(()=>p.notification('paystack',{body:raw,get:()=>signature+'a'}),{status:401});
});
test('PayFast checks signature, merchant, source IP and server confirmation',async()=>{
 const data={merchant_id:env.PAYFAST_MERCHANT_ID,m_payment_id:order.reference,pf_payment_id:'12345',payment_status:'COMPLETE',amount_gross:'100.00'};
 data.signature=payfastSignature(data,env.PAYFAST_PASSPHRASE);const req={body:Buffer.from(new URLSearchParams(data).toString()),ip:'192.0.2.1'};
 const lookup=async()=>[{address:'192.0.2.1'}];
 assert.equal((await createPayments(env,async()=>({ok:true,text:async()=> 'VALID'}),lookup).notification('payfast',req)).amount,10000);
 await assert.rejects(()=>createPayments(env,async()=>({ok:true,text:async()=> 'INVALID'}),lookup).notification('payfast',req),{status:502});
 await assert.rejects(()=>createPayments(env,undefined,lookup).notification('payfast',{...req,ip:'192.0.2.2'}),{status:401});
});
test('HTTP webhook matching, duplicate events, owner checks and cached checkout retries',async t=>{
 const saved={...order,payment_checkout:{id:'cs_test',url:'https://checkout.stripe.com/test'}};let updates=0,starts=0;
 const db={release(){},async query(sql,args){
  if(sql.startsWith('SELECT * FROM orders'))return {rowCount:args[0]===saved.reference&&(!args[1]||args[1]===saved.customer_id)?1:0,rows:[saved]};
  if(sql.startsWith("UPDATE orders SET status='paid'")){updates++;saved.status='paid';saved.payment_transaction=args[1];}
  return {rowCount:0,rows:[]};
 }};const pool={connect:async()=>db,query:db.query};
 const payments=createPayments(env);const start=payments.start;payments.start=async o=>{starts++;return start(o);};
 const app=express();mountPaymentWebhooks(app,pool,payments);app.use(express.json());
 const next=(req,res,n)=>n(),customer=(req,res,n)=>{req.customer={id:req.get('x-customer')||saved.customer_id,profile:{}};n();};
 mountOrders(app,pool,next,next,next,customer,payments);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const endpoint='/api/orders/'+saved.reference;
 assert.equal((await fetch(base+endpoint,{headers:{'x-customer':crypto.randomUUID()}})).status,404);
 for(let i=0;i<2;i++)assert.equal((await fetch(base+endpoint+'/payment',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,200);
 assert.equal(starts,0);
 const event=amount=>JSON.stringify({type:'checkout.session.completed',data:{object:{id:'cs_test',mode:'payment',payment_status:'paid',client_reference_id:saved.reference,amount_total:amount,currency:'zar',payment_intent:'pi_test'}}});
 const send=async(raw,signature=signed(raw))=>fetch(base+'/api/payments/webhooks/stripe',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body:raw});
 assert.equal((await send(event(10000),'invalid')).status,401);assert.equal(updates,0);
 assert.equal((await send(event(9999))).status,409);assert.equal(updates,0);
 assert.equal((await send(event(10000))).status,200);assert.equal(updates,1);
 assert.equal((await send(event(10000))).status,200);assert.equal(updates,1);
 assert.equal((await fetch(base+endpoint+'/payment',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,409);
 assert.equal((await (await fetch(base+endpoint)).json()).status,'paid');
});
