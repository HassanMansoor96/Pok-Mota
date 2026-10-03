'use strict';
require('dotenv').config();
const express=require('express'),helmet=require('helmet'),crypto=require('node:crypto'),path=require('node:path');
const pool=require('./db'),{validateProduct}=require('./validation');
const app=express();app.disable('x-powered-by');app.set('trust proxy',process.env.TRUST_PROXY==='1'?1:false);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],scriptSrcAttr:["'none'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["'self'","https://fonts.gstatic.com"],imgSrc:["'self'","https:","data:"],connectSrc:["'self'"],formAction:["'self'","https://www.payfast.co.za","https://sandbox.payfast.co.za"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:process.env.NODE_ENV==='production'?[]:null}}}));
app.use('/api/admin',(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
const payments=require('./payments').createPayments();
require('./payments').mountPaymentWebhooks(app,pool,payments);
app.use(express.json({limit:'25kb'}));
app.use('/api',require('./rate-limiter').limiter(pool,'api',{windowMs:15*60*1000,limit:300,standardHeaders:'draft-7',legacyHeaders:false}));
const prod=process.env.NODE_ENV==='production';
const username=process.env.ADMIN_USERNAME,password=process.env.ADMIN_PASSWORD;
const {checkPassword}=require('./customers');
let adminHash=process.env.ADMIN_PASSWORD_HASH;
if(!username)throw Error('ADMIN_USERNAME is required');
if(!adminHash){
 if(prod||!password||password==='replace-with-a-long-random-password'||password.length<16)throw Error('Set ADMIN_PASSWORD_HASH; plaintext admin passwords are development-only');
 const salt=crypto.randomBytes(16).toString('hex');adminHash=salt+':'+crypto.scryptSync(password,salt,64).toString('hex');
}
if(!/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(adminHash))throw Error('Invalid ADMIN_PASSWORD_HASH');
if(prod){let origin;try{origin=new URL(process.env.PUBLIC_ORIGIN);}catch{}if(!origin||origin.protocol!=='https:'||origin.origin!==process.env.PUBLIC_ORIGIN)throw Error('PUBLIC_ORIGIN must be an exact HTTPS origin in production');}
const mfaEnabled=process.env.ADMIN_TOTP_ENABLED==='true';
if(prod&&!mfaEnabled)throw Error('Production admin requires authenticator MFA enrollment');
if(mfaEnabled)require('./totp').decodeBase32(process.env.ADMIN_TOTP_SECRET);
const SESSION_MS=8*60*60*1000;
const credentialVersion=crypto.createHash('sha256').update(username+':'+adminHash+(mfaEnabled?':'+process.env.ADMIN_TOTP_SECRET:'')).digest('hex');
const adminSessions=require('./admin-sessions').createAdminSessions(pool,credentialVersion);
const auth=adminSessions.auth;
const same=(a,b)=>{const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);};
function csrf(req,res,next){const origin=req.get('origin');const expected=process.env.PUBLIC_ORIGIN||req.protocol+'://'+req.get('host');if(!origin||origin!==expected)return res.status(403).json({error:'Invalid origin'});next();}
function token(req,res,next){if(!same(req.get('x-csrf-token')||'',req.adminSession.csrf))return res.status(403).json({error:'Invalid CSRF token'});next();}
const loginLimiter=require('./rate-limiter').limiter(pool,'admin-login',{windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many attempts. Try later.'}});
app.post('/api/admin/login',loginLimiter,csrf,async(req,res,next)=>{try{const input=req.body?.password;const valid=typeof input==='string'&&input.length<=128&&await checkPassword(input,adminHash);if(!same(req.body?.username||'',username)||!valid)return res.status(401).json({error:'Invalid credentials'});if(mfaEnabled){const step=require('./totp').matchStep(process.env.ADMIN_TOTP_SECRET,req.body?.code);if(step===null)return res.status(401).json({error:'Invalid credentials'});const accepted=await pool.query("INSERT INTO admin_totp_used(credential_version,time_step,expires_at) VALUES($1,$2,now()+interval '5 minutes') ON CONFLICT DO NOTHING RETURNING time_step",[credentialVersion,step]);if(!accepted.rowCount)return res.status(401).json({error:'Invalid credentials'});}
const csrfToken=crypto.randomBytes(32).toString('hex'),sid=await adminSessions.start(req,csrfToken);res.cookie('pm_session',sid,{httpOnly:true,secure:prod,sameSite:'strict',path:'/api/admin',maxAge:SESSION_MS});res.json({ok:true,csrfToken});}catch(e){next(e);}});
app.get('/api/admin/session',auth,(req,res)=>res.json({ok:true,csrfToken:req.adminSession.csrf}));
app.post('/api/admin/logout',csrf,auth,token,async(req,res,next)=>{try{await adminSessions.remove(req);res.clearCookie('pm_session',{httpOnly:true,secure:prod,sameSite:'strict',path:'/api/admin'});res.json({ok:true});}catch(e){next(e);}});
require('./card-catalogue').mountCatalogue(app,auth);
require('./sealed-catalogue').mountSealedCatalogue(app,auth);
const requireCustomer=require('./customers').mountCustomers(app,pool,csrf);
require('./orders').mountOrders(app,pool,auth,csrf,token,requireCustomer,payments);
require('./operations').mountOperations(app,pool,auth,csrf,token,payments);
const fields='id,name,set_name AS "set",card_number AS "number",category,rarity,condition,price_cents/100.0 AS price,stock,theme,art,tag,description,image_url AS "imageUrl",is_published AS "isPublished",card_metadata AS "cardMetadata",created_at AS "createdAt",updated_at AS "updatedAt"';
app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.set('Cache-Control','no-store').json({ok:true});}catch{res.status(503).json({ok:false});}});
app.get('/api/products',async(req,res,next)=>{try{const r=await pool.query('SELECT '+fields+' FROM products WHERE is_published=true ORDER BY created_at DESC LIMIT 500');res.set('Cache-Control','no-store');res.json(r.rows.map(p=>({...p,price:Number(p.price)})));}catch(e){next(e);}});
app.get('/api/products/:id',async(req,res,next)=>{try{if(!uuid(req.params.id))return res.status(404).json({error:'Not found'});const r=await pool.query('SELECT '+fields+' FROM products WHERE id=$1 AND is_published=true',[req.params.id]);if(!r.rows.length)return res.status(404).json({error:'Not found'});res.json({...r.rows[0],price:Number(r.rows[0].price)});}catch(e){next(e);}});
app.get('/api/admin/products',auth,async(req,res,next)=>{try{const r=await pool.query('SELECT xmin::text AS version,'+fields+' FROM products ORDER BY updated_at DESC LIMIT 1000');res.set('Cache-Control','no-store');res.json(r.rows.map(p=>({...p,price:Number(p.price)})));}catch(e){next(e);}});
function uuid(s){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);}
app.post('/api/admin/products',csrf,auth,token,async(req,res,next)=>{const v=validateProduct(req.body);if(v.error)return res.status(400).json({error:v.error});const p=v.value,id=crypto.randomUUID();try{const r=await pool.query('INSERT INTO products (id,name,set_name,card_number,category,rarity,condition,price_cents,stock,theme,art,tag,description,image_url,is_published,card_metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id',[id,p.name,p.set,p.number,p.category,p.rarity,p.condition,p.priceCents,p.stock,p.theme,p.art,p.tag,p.description,p.imageUrl,p.isPublished,JSON.stringify(p.cardMetadata)]);res.status(201).json({id:r.rows[0].id});}catch(e){next(e);}});
app.put('/api/admin/products/:id',csrf,auth,token,async(req,res,next)=>{if(typeof req.body?.version!=='string'||!/^\d{1,20}$/.test(req.body.version))return res.status(409).json({error:'Reload the product before saving.'});if(!uuid(req.params.id))return res.status(404).json({error:'Not found'});const v=validateProduct(req.body);if(v.error)return res.status(400).json({error:v.error});const p=v.value;try{const r=await pool.query('UPDATE products SET name=$2,set_name=$3,card_number=$4,category=$5,rarity=$6,condition=$7,price_cents=$8,stock=$9,theme=$10,art=$11,tag=$12,description=$13,image_url=$14,is_published=$15,card_metadata=$16,updated_at=now() WHERE id=$1 AND xmin::text=$17 RETURNING id',[req.params.id,p.name,p.set,p.number,p.category,p.rarity,p.condition,p.priceCents,p.stock,p.theme,p.art,p.tag,p.description,p.imageUrl,p.isPublished,JSON.stringify(p.cardMetadata),req.body.version]);if(!r.rows.length)return res.status(409).json({error:'Product or stock changed. Reload the product and review before saving.'});res.json({id:r.rows[0].id,updated:true});}catch(e){next(e);}});
const publicFiles=new Set(['index.html','catalogue.html','product.html','collections.html','about.html','faq.html','shipping.html','contact.html','privacy.html','inventory-preview.html','admin.html','styles.css','site.css','admin.css','products.js','app.js','site.js','storefront-loader.js','admin.js','card-display.js','cart.js','checkout.html','checkout.js','checkout.css','admin-orders.js','account.html','account.js']);
app.use((req,res,next)=>{if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).end();const filename=req.path.slice(1)||'index.html';if(!publicFiles.has(filename))return res.status(404).end();res.sendFile(path.join(__dirname,'..',filename),{dotfiles:'deny',headers:{'Cache-Control':filename.endsWith('.html')?'no-store':'public, max-age=60'}});});
app.use((err,req,res,next)=>{console.error('Request failed:',Number.isInteger(err.status)?err.status:'internal');const status=[400,413,415].includes(err.status)?err.status:500;res.status(status).json({error:status===500?'Internal server error':'Invalid request body'});});
if(require.main===module){
 const port=Number(process.env.PORT||3000);
 require('./database-config').assertRuntimeRole(pool).then(()=>{
  const server=app.listen(port,prod?'0.0.0.0':'127.0.0.1',()=>console.log('Store running at http://localhost:'+port));
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port '+port+' is in use. Stop the duplicate development server.':'Server failed to listen.');pool.end();process.exitCode=1;});
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{const timeout=setTimeout(()=>process.exit(1),25000);timeout.unref();server.close(()=>pool.end().then(()=>{clearTimeout(timeout);process.exit(0);}));});
 }).catch(e=>{console.error('Startup blocked:',e.code||e.message);pool.end();process.exitCode=1;});
}
module.exports=app;
