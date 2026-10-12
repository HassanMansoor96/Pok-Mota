'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),crypto=require('node:crypto');
const {normalizeEvent,mountTraffic}=require('../server/traffic');
const origin='https://store.example',event={id:crypto.randomUUID(),session:crypto.randomUUID(),path:'/catalogue.html',referrer:'google.com'};
test('traffic stores only allowed page paths, hashed visits, referrer domains and device categories',()=>{
  const normalized=normalizeEvent({...event,email:'private@example.com',ip:'1.2.3.4'},origin,'iPhone Mobile');
  assert.equal(normalized.device,'mobile');assert.equal(normalized.referrer,'google.com');assert.equal(normalized.sessionHash.length,64);assert.notEqual(normalized.sessionHash,event.session);assert.equal(normalized.email,undefined);assert.equal(normalized.ip,undefined);
  for(const path of ['/admin.html','/server/index.js','/checkout.html?order=secret','https://evil.example/','/unknown'])assert.equal(normalizeEvent({...event,path},origin),null);
  for(const referrer of ['store.example','google.com/path?secret=1','name@example.com','<script>alert(1)</script>'])assert.equal(normalizeEvent({...event,referrer},origin).referrer,'');
});
test('tracking rejects foreign origins, excludes bots and opt-outs, deduplicates views and protects reports',async t=>{
  const saved=new Map();let inserts=0;
  const pool={query:async(sql,args)=>{
    if(sql.startsWith('INSERT INTO site_page_views')){inserts++;saved.set(args[0],args);return {rows:[]};}
    return {rows:[]};}};
  const app=express();app.use(express.json());mountTraffic(app,pool,(req,res,next)=>req.get('authorization')==='test'?next():res.status(401).end());
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
  const post=(body=event,headers={})=>fetch(base+'/api/traffic',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...headers},body:JSON.stringify(body)});
  assert.equal((await post(event,{Origin:'https://evil.example'})).status,403);
  for(const headers of [{DNT:'1'},{'Sec-GPC':'1'},{'User-Agent':'Googlebot'}])assert.equal((await post(event,headers)).status,204);
  assert.equal(inserts,0);assert.equal((await post({...event,path:'/admin.html'})).status,400);
  assert.equal((await post()).status,204);assert.equal((await post()).status,204);assert.equal(saved.size,1);assert.equal(saved.get(event.id)[1],crypto.createHash('sha256').update(event.session).digest('hex'));
  assert.equal((await fetch(base+'/api/admin/traffic')).status,401);
  assert.equal((await fetch(base+'/api/admin/traffic?days=365',{headers:{authorization:'test'}})).status,400);
  const response=await fetch(base+'/api/admin/traffic?days=7',{headers:{authorization:'test'}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).days,7);
});
