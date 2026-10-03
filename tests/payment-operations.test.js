'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express');
const {createPayments,confirmPayment}=require('../server/payments'),{mountOperations}=require('../server/operations');
const env={PUBLIC_ORIGIN:'https://store.example',PAYMENT_MODE:'sandbox',PAYSTACK_SECRET_KEY:'sk_test_fixture'};
const order={id:crypto.randomUUID(),reference:'PM-0123456789ABCDEF0123',payment_method:'paystack',status:'pending_payment',total_cents:10000,payment_checkout:{id:'PM-0123456789ABCDEF0123'}};
const data={reference:order.reference,amount:10000,currency:'ZAR',domain:'test',status:'success',id:42};
test('Paystack live credentials need matching mode and explicit sandbox sign-off',()=>{
 assert.throws(()=>createPayments({...env,PAYSTACK_SECRET_KEY:'sk_live_fixture'}));
 assert.throws(()=>createPayments({...env,PAYMENT_MODE:'live',PAYSTACK_SECRET_KEY:'sk_live_fixture'}));
 assert.equal(createPayments({...env,PAYMENT_MODE:'live',PAYSTACK_SECRET_KEY:'sk_live_fixture',PAYSTACK_LIVE_READY:'true'}).mode,'live');
});
test('Paystack verification matches order, amount, currency and environment before payment confirmation',async()=>{
 const provider=d=>createPayments(env,async()=>({ok:true,json:async()=>({status:true,data:d})}));
 assert.equal((await provider(data).verify(order)).payment.transaction,'42');
 for(const wrong of [{amount:9999},{currency:'USD'},{reference:'different'},{domain:'live'},{id:undefined}])await assert.rejects(()=>provider({...data,...wrong}).verify(order));
 for(const status of ['pending','failed','abandoned','reversed'])assert.equal((await provider({...data,status}).verify(order)).payment,null);
});
test('Paystack webhook rejects wrong environment and missing transaction ID despite a valid signature',async()=>{
 for(const change of [{domain:'live'},{id:undefined}]){const raw=Buffer.from(JSON.stringify({event:'charge.success',data:{...data,...change}})),signature=crypto.createHmac('sha512',env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');await assert.rejects(()=>createPayments(env).notification('paystack',{body:raw,get:()=>signature}),{status:409});}
});
test('reconciliation uses the same idempotent paid transition as webhooks',async()=>{
 const saved={...order},payment={reference:order.reference,amount:10000,currency:'ZAR',id:order.reference,transaction:'42'};let writes=0;
 const db={async query(){writes++;saved.status='paid';saved.payment_transaction='42';}};
 await confirmPayment(db,saved,'paystack',payment);await confirmPayment(db,saved,'paystack',payment);assert.equal(writes,1);
 await assert.rejects(()=>confirmPayment(db,saved,'paystack',{...payment,transaction:'43'}),{status:409});
});
test('admin reconciliation has authentication and CSRF middleware and does not charge or restock',async t=>{
 let verifications=0,updates=0;const saved={...order};const db={release(){},async query(sql){if(sql.startsWith('SELECT *'))return {rowCount:1,rows:[saved]};if(sql.startsWith("UPDATE orders SET status='paid'")){updates++;saved.status='paid';saved.payment_transaction='42';}assert.ok(!/UPDATE products/.test(sql));return {rows:[],rowCount:0};}};
 const app=express();app.use(express.json());const auth=(req,res,next)=>req.get('x-admin')==='fixture'?next():res.sendStatus(401),csrf=(req,res,next)=>req.get('origin')==='https://store.example'?next():res.sendStatus(403),token=(req,res,next)=>req.get('x-csrf-token')==='fixture'?next():res.sendStatus(403);
 mountOperations(app,{connect:async()=>db},auth,csrf,token,{verify:async()=>{verifications++;return {status:'success',payment:{reference:order.reference,amount:10000,currency:'ZAR',id:order.reference,transaction:'42'}};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/api/admin/orders/'+order.id+'/reconcile';
 const headers={'Content-Type':'application/json',origin:'https://store.example'};
 assert.equal((await fetch(url,{method:'POST',headers,body:'{}'})).status,401);
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,'x-admin':'fixture'},body:'{}'})).status,403);assert.equal(verifications,0);
 const response=await fetch(url,{method:'POST',headers:{...headers,'x-admin':'fixture','x-csrf-token':'fixture'},body:'{}'});assert.equal(response.status,200);assert.equal((await response.json()).status,'paid');assert.equal(updates,1);
});
