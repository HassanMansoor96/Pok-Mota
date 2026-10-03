'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
test('actual production app enforces authentication, CSRF, cookies, file boundary, headers and login limits',async t=>{
 process.env.NODE_ENV='production';process.env.ADMIN_TOTP_ENABLED='true';process.env.ADMIN_TOTP_SECRET='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';process.env.PUBLIC_ORIGIN='https://store.example';process.env.ADMIN_USERNAME='review-admin';process.env.ADMIN_PASSWORD_HASH='0123456789abcdef0123456789abcdef:'+crypto.scryptSync('isolated-review-password','0123456789abcdef0123456789abcdef',64).toString('hex');process.env.DATABASE_URL='postgres://unused';
 const dbPath=require.resolve('../server/db'),sessions=new Map(),hits=new Map();require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query:async(sql,args)=>{
 if(sql.startsWith('INSERT INTO rate_limit_counters')){const key=args[0]+args[1],count=(hits.get(key)||0)+1;hits.set(key,count);return {rows:[{hits:count,expires_at:new Date(Date.now()+args[2])}],rowCount:1};}
 if(sql.startsWith('INSERT INTO admin_totp_used'))return {rows:[{}],rowCount:1};
 if(sql.startsWith('INSERT INTO admin_sessions')){sessions.set(args[0],{csrf:args[1],version:args[2]});return {rows:[],rowCount:1};}
 if(sql.startsWith('SELECT csrf_token')){const value=sessions.get(args[0]);return {rows:value&&value.version===args[1]?[value]:[],rowCount:value&&value.version===args[1]?1:0};}
 if(sql.startsWith('DELETE FROM admin_sessions'))sessions.delete(args[0]);
 return {rows:[],rowCount:0};}}};
 const app=require('../server/index'),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const request=(path,method='GET',body,headers={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 for(const path of ['/api/admin/session','/api/admin/products','/api/admin/orders','/api/admin/card-catalogue/sets','/api/admin/sealed-catalogue/sets','/api/account/profile','/api/account/orders','/api/orders/PM-00000000000000000000'])assert.equal((await request(path)).status,401,path);
 for(const path of ['/.env','/server/index.js','/package.json','/.git/config','/PAYMENT-SETUP.md'])assert.equal((await request(path)).status,404,path);
 const page=await request('/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.match(page.headers.get('strict-transport-security'),/max-age/);assert.equal(page.headers.get('x-content-type-options'),'nosniff');assert.equal(page.headers.get('access-control-allow-origin'),null);
 const credentials={username:'review-admin',password:'isolated-review-password',code:require('../server/totp').totp(process.env.ADMIN_TOTP_SECRET)};
 assert.equal((await request('/api/admin/login','POST',credentials)).status,403);
 assert.equal((await request('/api/admin/login','POST',credentials,{Origin:'https://evil.example'})).status,403);
 const login=await request('/api/admin/login','POST',credentials,{Origin:process.env.PUBLIC_ORIGIN});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');for(const flag of ['HttpOnly','Secure','SameSite=Strict','Max-Age=28800'])assert.ok(cookie.includes(flag));const sid=cookie.split(';')[0],data=await login.json();assert.match(login.headers.get('cache-control'),/no-store/);
 assert.equal((await request('/api/admin/products','POST',{}, {Origin:process.env.PUBLIC_ORIGIN,Cookie:sid})).status,403);
 assert.equal((await request('/api/admin/logout','POST',{}, {Origin:process.env.PUBLIC_ORIGIN,Cookie:sid,'x-csrf-token':data.csrfToken})).status,200);
 assert.equal((await request('/api/admin/session','GET',undefined,{Cookie:sid})).status,401);
 const malformed=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);assert.deepEqual(await malformed.json(),{error:'Invalid request body'});
 let last;for(let i=0;i<11;i++)last=await request('/api/admin/login','POST',{username:'wrong',password:'wrong'},{Origin:process.env.PUBLIC_ORIGIN});assert.equal(last.status,429);
});
