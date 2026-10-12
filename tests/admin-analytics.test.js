'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {analytics,mountAnalytics}=require('../server/analytics');
test('analytics aggregates all records, excludes unpaid sales, and converts PostgreSQL totals',async()=>{
  const calls=[];const pool={query:async(sql,args)=>{calls.push({sql,args});
    if(sql.includes('AS "paidOrders"'))return {rows:[{orders:4,paidOrders:2,pendingOrders:1,cancelledOrders:1,revenueCents:'12345',pendingCents:'1000'}]};
    if(sql.includes('FROM products'))return {rows:[{listings:1010,stockRetailCents:'500000',units:'2000'}]};
    if(sql.includes('jsonb_array_elements'))return {rows:[{id:'uuid',name:'Card <script>',units:'3',revenueCents:'2345'}]};
    return {rows:[{date:'2026-10-12',orders:2,revenueCents:'12345'}]};}};
  const result=await analytics(pool,30);assert.equal(result.sales.revenueCents,12345);assert.equal(result.inventory.listings,1010);assert.equal(result.topProducts[0].units,3);assert.equal(result.daily[0].date,'2026-10-12');
  for(const call of calls.filter(c=>c.args)){assert.deepEqual(call.args,[30]);assert.match(call.sql,/status IN \('paid','fulfilled'\)/);}
  assert.ok(calls.every(c=>!c.sql.includes('customer')));
});
test('analytics is private, authenticated and validates periods before querying',async t=>{
  let calls=0;const pool={query:async()=>{calls++;return {rows:[]};}},app=express();
  mountAnalytics(app,pool,(req,res,next)=>req.get('authorization')==='test'?next():res.status(401).end());
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/api/admin/analytics';
  assert.equal((await fetch(url)).status,401);assert.equal(calls,0);
  for(const suffix of ['?days=0','?days=30x','?days=7&days=30'])assert.equal((await fetch(url+suffix,{headers:{authorization:'test'}})).status,400);
  assert.equal(calls,0);const response=await fetch(url+'?days=90',{headers:{authorization:'test'}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).days,90);
});
