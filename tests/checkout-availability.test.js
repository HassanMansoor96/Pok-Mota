'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {mountOrders}=require('../server/orders');
test('production checkout reports its gates and rejects closed orders before touching order data',async t=>{
 const previous={NODE_ENV:process.env.NODE_ENV,CHECKOUT_ENABLED:process.env.CHECKOUT_ENABLED,POLICIES_APPROVED:process.env.POLICIES_APPROVED};
 Object.assign(process.env,{NODE_ENV:'production',CHECKOUT_ENABLED:'false',POLICIES_APPROVED:'false'});
 t.after(()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;});
 const calls=[];
 const pool={async query(sql){calls.push(sql);if(sql.includes('rate_limit_counters'))return {rows:[{hits:1,expires_at:new Date(Date.now()+60000)}]};throw Error('Unexpected data query');},async connect(){throw Error('Order transaction must not start');}};
 const app=express();app.use(express.json());const pass=(req,res,next)=>next();
 mountOrders(app,pool,pass,pass,pass,pass,{methods:()=>[{id:'eft',label:'EFT'}],mode:'sandbox'});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 for(const [enabled,approved,open] of [['false','false',false],['true','false',false],['false','true',false],['true','true',true]]){
  process.env.CHECKOUT_ENABLED=enabled;process.env.POLICIES_APPROVED=approved;
  const response=await fetch(base+'/api/checkout/config');const config=await response.json();
  assert.equal(config.checkoutOpen,open);assert.equal(config.eftInstructions,undefined);assert.match(response.headers.get('cache-control'),/no-store/);
  if(!open){const rejected=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(rejected.status,503);assert.deepEqual(await rejected.json(),{code:'CHECKOUT_CLOSED',error:'Checkout is not open yet. Please contact support.'});}
 }
 assert.ok(calls.every(sql=>sql.includes('rate_limit_counters')));
});
