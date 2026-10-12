'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),crypto=require('node:crypto');
const {mountCustomers,hashPassword,checkPassword}=require('../server/customers');
const {mountOrders}=require('../server/orders');
test('password hashes are salted and verify only the correct password',async()=>{const a=await hashPassword('collector-password');const b=await hashPassword('collector-password');assert.notEqual(a,b);assert.equal(await checkPassword('collector-password',a),true);assert.equal(await checkPassword('wrong-password',a),false);});
test('account session supplies trusted order contacts and expires after logout',async t=>{
 let user,session,order;const productId=crypto.randomUUID();
 const pool={async query(sql,args){
  if(sql.startsWith('INSERT INTO customers')){user={id:args[0],profile:JSON.parse(args[1]),email:args[2],password_hash:args[3]};return {rowCount:1};}
  if(sql.startsWith('INSERT INTO customer_sessions')){session={hash:args[0]};return {rowCount:1};}
  if(sql.startsWith('SELECT c.id'))return {rowCount:session&&session.hash===args[0]?1:0,rows:session&&session.hash===args[0]?[user]:[]};
  if(sql.startsWith('SELECT id,profile'))return {rowCount:user?.email===args[0]?1:0,rows:user?.email===args[0]?[user]:[]};
  if(sql.startsWith('UPDATE customers SET profile')){user.profile=JSON.parse(args[1]);return {rowCount:1};}
  if(sql.startsWith('DELETE FROM customer_sessions WHERE token_hash'))session=null;
  return {rowCount:0,rows:[]};
 },async connect(){return {release(){},async query(sql,args){
  if(sql.startsWith('SELECT * FROM orders'))return {rowCount:order?1:0,rows:order?[order]:[]};
  if(sql.startsWith('SELECT id,name'))return {rows:[{id:productId,name:'Card',is_published:true,stock:3,price_cents:1000}]};
  if(sql.startsWith('INSERT INTO orders')){order={reference:args[1],request_hash:args[3],customer:JSON.parse(args[4]),fulfilment:args[5],total_cents:args[9],customer_id:args[10],status:'pending_payment'};return {rows:[order]};}
  return {rows:[],rowCount:0};
 }}}};
 const app=express();app.use(express.json());const csrf=(req,res,next)=>next(),customer=mountCustomers(app,pool,csrf);mountOrders(app,pool,csrf,csrf,csrf,customer);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;let cookie='';
 async function request(path,method='GET',body,headers={}){return fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie,...headers},body:body?JSON.stringify(body):undefined});}
 assert.equal((await request('/api/orders','POST',{})).status,401);
 const registered=await request('/api/account/register','POST',{name:'Saved Buyer',email:'BUYER@example.com',phone:'0123456789',password:'collector-password'});assert.equal(registered.status,200);cookie=registered.headers.get('set-cookie').split(';')[0];
 assert.equal((await (await request('/api/account/profile')).json()).profile.email,'buyer@example.com');
 const key=crypto.randomUUID(),body={items:[{id:productId,quantity:1}],fulfilment:'collection',customer:{name:'Spoofed Buyer',email:'spoof@example.com',phone:'0999999999'},expectedTotalCents:1000};
 assert.equal((await request('/api/orders','POST',body,{'Idempotency-Key':key})).status,201);assert.equal(order.customer.name,'Saved Buyer');assert.equal(order.customer_id,user.id);
 assert.equal((await request('/api/account/profile','PUT',{...user.profile,name:'Updated Buyer'})).status,200);
 assert.equal((await request('/api/orders','POST',body,{'Idempotency-Key':key})).status,200);assert.equal(order.customer.name,'Saved Buyer');
 assert.equal((await request('/api/account/logout','POST',{})).status,200);assert.equal((await request('/api/account/profile')).status,401);
 assert.equal((await request('/api/account/login','POST',{email:'buyer@example.com',password:'incorrect-password'})).status,401);
 assert.equal((await request('/api/account/login','POST',{email:'buyer@example.com',password:'collector-password'})).status,200);
});
