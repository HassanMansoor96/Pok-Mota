'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {mountOrders}=require('../server/orders');
test('order history requires sign-in and queries only the current customer',async t=>{
 const calls=[],orders=[{reference:'PM-0123456789ABCDEF0123',status:'paid',items:[{name:'Card',quantity:2}],totalCents:2000}];
 const pool={async query(sql,args){calls.push({sql,args});return {rows:orders};}};
 const app=express(),pass=(req,res,next)=>next();
 const customer=(req,res,next)=>{if(req.get('X-Test-Customer')!=='buyer')return res.status(401).json({error:'Sign in'});req.customer={id:'customer-id'};next();};
 mountOrders(app,pool,pass,pass,pass,customer);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const url='http://127.0.0.1:'+server.address().port+'/api/account/orders';
 assert.equal((await fetch(url)).status,401);assert.equal(calls.length,0);
 const response=await fetch(url+'?customer_id=someone-else',{headers:{'X-Test-Customer':'buyer'}});
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 assert.deepEqual(await response.json(),{orders});assert.deepEqual(calls[0].args,['customer-id']);
 assert.match(calls[0].sql,/WHERE customer_id=\$1 ORDER BY created_at DESC/);
});
