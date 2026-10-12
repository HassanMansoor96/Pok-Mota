'use strict';
const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function mountAccountSecurity(app,pool,csrf,requireCustomer,hashPassword,checkPassword){
 const limit=require('./rate-limiter').limiter(pool,'account-security',{windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
 const wrap=fn=>async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{await fn(req,res);}catch(e){next(e);}};
 const validPassword=p=>typeof p==='string'&&p.length>=12&&p.length<=128;
 const clear=res=>res.clearCookie('pm_customer',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api'});
 app.get('/api/account/help',(req,res)=>res.json({supportEmail:process.env.SUPPORT_EMAIL||null}));
 app.post('/api/account/password',limit,csrf,requireCustomer,wrap(async(req,res)=>{
  if(!validPassword(req.body?.newPassword)||typeof req.body.currentPassword!=='string'||req.body.currentPassword.length>128)return res.status(400).json({error:'Enter your current password and a new password between 12 and 128 characters.'});
  const db=await pool.connect();try{await db.query('BEGIN');const r=await db.query('SELECT password_hash FROM customers WHERE id=$1 FOR UPDATE',[req.customer.id]);
   if(!r.rowCount||!await checkPassword(req.body.currentPassword,r.rows[0].password_hash)){await db.query('ROLLBACK');return res.status(401).json({error:'Current password is incorrect.'});}
   await db.query('UPDATE customers SET password_hash=$2 WHERE id=$1',[req.customer.id,await hashPassword(req.body.newPassword)]);
   await db.query('DELETE FROM customer_sessions WHERE customer_id=$1',[req.customer.id]);await db.query('DELETE FROM account_recovery_tokens WHERE customer_id=$1',[req.customer.id]);
   await db.query('COMMIT');clear(res);res.json({ok:true});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }));
 app.post('/api/account/reset-password',limit,csrf,wrap(async(req,res)=>{
  if(!/^[0-9a-f]{64}$/.test(req.body?.token||'')||!validPassword(req.body?.newPassword))return res.status(400).json({error:'Use a valid recovery link and a password between 12 and 128 characters.'});
  const hash=await hashPassword(req.body.newPassword),db=await pool.connect();try{await db.query('BEGIN');
   const found=await db.query('SELECT customer_id FROM account_recovery_tokens WHERE token_hash=$1 AND expires_at>now()',[digest(req.body.token)]);
   if(!found.rowCount){await db.query('ROLLBACK');return res.status(400).json({error:'Recovery link is invalid or expired.'});}
   const id=found.rows[0].customer_id;await db.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE',[id]);
   const consumed=await db.query('DELETE FROM account_recovery_tokens WHERE token_hash=$1 AND expires_at>now() RETURNING customer_id',[digest(req.body.token)]);
   if(!consumed.rowCount){await db.query('ROLLBACK');return res.status(400).json({error:'Recovery link is invalid or expired.'});}
   await db.query('UPDATE customers SET password_hash=$2 WHERE id=$1',[id,hash]);await db.query('DELETE FROM customer_sessions WHERE customer_id=$1',[id]);await db.query('DELETE FROM account_recovery_tokens WHERE customer_id=$1',[id]);
   await db.query('COMMIT');clear(res);res.json({ok:true});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }));
}
async function issueRecovery(pool,email){
 const db=await pool.connect();try{await db.query('BEGIN');const r=await db.query('SELECT id FROM customers WHERE email=$1 FOR UPDATE',[email.trim().toLowerCase()]);
  if(!r.rowCount)throw Error('No matching account');const id=r.rows[0].id,token=crypto.randomBytes(32).toString('hex');await db.query('DELETE FROM account_recovery_tokens WHERE customer_id=$1',[id]);
  await db.query("INSERT INTO account_recovery_tokens(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[digest(token),id]);await db.query('COMMIT');return token;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
module.exports={mountAccountSecurity,issueRecovery};
