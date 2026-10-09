'use strict';
const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const sessionCookie=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pm_session='))?.slice(11);
function createAdminSessions(pool,credentialVersion){
 async function remove(req){const sid=sessionCookie(req);if(sid)await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1',[digest(sid)]);}
 async function start(req,csrf){await remove(req);const sid=crypto.randomBytes(32).toString('hex');await pool.query("INSERT INTO admin_sessions(token_hash,csrf_token,credential_version,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[digest(sid),csrf,credentialVersion]);return sid;}
 async function auth(req,res,next){try{
  const sid=sessionCookie(req);if(!/^[0-9a-f]{64}$/.test(sid||''))return res.status(401).json({error:'Sign in required'});
  const r=await pool.query('SELECT csrf_token AS csrf FROM admin_sessions WHERE token_hash=$1 AND credential_version=$2 AND expires_at>now()',[digest(sid),credentialVersion]);
  if(!r.rowCount)return res.status(401).json({error:'Sign in required'});req.adminSession=r.rows[0];next();
 }catch(e){next(e);}}
 return {start,remove,auth};
}
module.exports={createAdminSessions};
