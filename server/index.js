'use strict';
require('dotenv').config();
const express=require('express'),helmet=require('helmet'),rateLimit=require('express-rate-limit'),crypto=require('node:crypto'),path=require('node:path');
const pool=require('./db'),{validateProduct}=require('./validation');
const app=express();app.disable('x-powered-by');app.set('trust proxy',process.env.TRUST_PROXY==='1'?1:false);
app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'25kb'}));
app.use('/api',rateLimit({windowMs:15*60*1000,limit:300,standardHeaders:'draft-7',legacyHeaders:false}));
const prod=process.env.NODE_ENV==='production';
const username=process.env.ADMIN_USERNAME,password=process.env.ADMIN_PASSWORD;
if(!username||!password||password==='replace-with-a-long-random-password'||password.length<16)throw Error('Set ADMIN_USERNAME and a unique ADMIN_PASSWORD (16+ characters) in .env');
if(prod&&!process.env.PUBLIC_ORIGIN)throw Error('PUBLIC_ORIGIN required in production');
const sessions=new Map(),SESSION_MS=8*60*60*1000;
const same=(a,b)=>{const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);};
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').slice(0,2)).filter(x=>x.length===2));}
function session(req){const token=cookies(req).pm_session;if(!token)return null;const entry=sessions.get(token);if(!entry)return null;if(entry.exp<Date.now()){sessions.delete(token);return null;}return entry;}
function auth(req,res,next){const s=session(req);if(!s)return res.status(401).json({error:'Sign in required'});req.adminSession=s;next();}
function csrf(req,res,next){const origin=req.get('origin');const expected=process.env.PUBLIC_ORIGIN||req.protocol+'://'+req.get('host');if(!origin||origin!==expected)return res.status(403).json({error:'Invalid origin'});next();}
function token(req,res,next){if(!same(req.get('x-csrf-token')||'',req.adminSession.csrf))return res.status(403).json({error:'Invalid CSRF token'});next();}
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many attempts. Try later.'}});
app.post('/api/admin/login',loginLimiter,csrf,(req,res)=>{if(!same(req.body?.username||'',username)||!same(req.body?.password||'',password))return res.status(401).json({error:'Invalid credentials'});const sid=crypto.randomBytes(32).toString('hex'),csrfToken=crypto.randomBytes(32).toString('hex');sessions.set(sid,{csrf:csrfToken,exp:Date.now()+SESSION_MS});res.cookie('pm_session',sid,{httpOnly:true,secure:prod,sameSite:'strict',path:'/api/admin',maxAge:SESSION_MS});res.json({ok:true,csrfToken});});
app.get('/api/admin/session',auth,(req,res)=>res.json({ok:true,csrfToken:req.adminSession.csrf}));
app.post('/api/admin/logout',csrf,auth,token,(req,res)=>{deleteSession(req);res.clearCookie('pm_session',{httpOnly:true,secure:prod,sameSite:'strict',path:'/api/admin'});res.json({ok:true});});
function deleteSession(req){const sid=cookies(req).pm_session;if(sid)sessions.delete(sid);}
const fields='id,name,set_name AS "set",card_number AS "number",category,rarity,condition,price_cents/100.0 AS price,stock,theme,art,tag,description,image_url AS "imageUrl",is_published AS "isPublished",created_at AS "createdAt",updated_at AS "updatedAt"';
app.get('/api/products',async(req,res,next)=>{try{const r=await pool.query('SELECT '+fields+' FROM products WHERE is_published=true ORDER BY created_at DESC LIMIT 500');res.set('Cache-Control','no-store');res.json(r.rows.map(p=>({...p,price:Number(p.price)})));}catch(e){next(e);}});
app.get('/api/products/:id',async(req,res,next)=>{try{if(!uuid(req.params.id))return res.status(404).json({error:'Not found'});const r=await pool.query('SELECT '+fields+' FROM products WHERE id=$1 AND is_published=true',[req.params.id]);if(!r.rows.length)return res.status(404).json({error:'Not found'});res.json({...r.rows[0],price:Number(r.rows[0].price)});}catch(e){next(e);}});
app.get('/api/admin/products',auth,async(req,res,next)=>{try{const r=await pool.query('SELECT '+fields+' FROM products ORDER BY updated_at DESC LIMIT 1000');res.set('Cache-Control','no-store');res.json(r.rows.map(p=>({...p,price:Number(p.price)})));}catch(e){next(e);}});
function uuid(s){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);}
app.post('/api/admin/products',csrf,auth,token,async(req,res,next)=>{const v=validateProduct(req.body);if(v.error)return res.status(400).json({error:v.error});const p=v.value,id=crypto.randomUUID();try{const r=await pool.query('INSERT INTO products (id,name,set_name,card_number,category,rarity,condition,price_cents,stock,theme,art,tag,description,image_url,is_published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id',[id,p.name,p.set,p.number,p.category,p.rarity,p.condition,p.priceCents,p.stock,p.theme,p.art,p.tag,p.description,p.imageUrl,p.isPublished]);res.status(201).json({id:r.rows[0].id});}catch(e){next(e);}});
app.put('/api/admin/products/:id',csrf,auth,token,async(req,res,next)=>{if(!uuid(req.params.id))return res.status(404).json({error:'Not found'});const v=validateProduct(req.body);if(v.error)return res.status(400).json({error:v.error});const p=v.value;try{const r=await pool.query('UPDATE products SET name=$2,set_name=$3,card_number=$4,category=$5,rarity=$6,condition=$7,price_cents=$8,stock=$9,theme=$10,art=$11,tag=$12,description=$13,image_url=$14,is_published=$15,updated_at=now() WHERE id=$1 RETURNING id',[req.params.id,p.name,p.set,p.number,p.category,p.rarity,p.condition,p.priceCents,p.stock,p.theme,p.art,p.tag,p.description,p.imageUrl,p.isPublished]);if(!r.rows.length)return res.status(404).json({error:'Not found'});res.json({id:r.rows[0].id,updated:true});}catch(e){next(e);}});
const publicFiles=new Set(['index.html','catalogue.html','product.html','collections.html','about.html','faq.html','shipping.html','contact.html','privacy.html','inventory-preview.html','admin.html','styles.css','site.css','admin.css','products.js','app.js','site.js','storefront-loader.js','admin.js']);
app.use((req,res,next)=>{if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).end();const filename=decodeURIComponent(req.path.slice(1))||'index.html';if(!publicFiles.has(filename))return res.status(404).end();res.sendFile(path.join(__dirname,'..',filename),{dotfiles:'deny',headers:{'Cache-Control':filename.endsWith('.html')?'no-store':'public, max-age=60'}});});
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Internal server error'});});
if(require.main===module){const port=Number(process.env.PORT||3000);app.listen(port,()=>console.log('PokéMota running at http://localhost:'+port));}
module.exports=app;
