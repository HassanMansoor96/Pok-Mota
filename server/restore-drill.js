'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),dotenv=require('dotenv');
const {createPool}=require('./database-config'),{backupDatabase,decryptBackup,runPg}=require('./backup'),{tables}=require('./provision-runtime');
const ident=value=>'"'+value.replace(/"/g,'""')+'"';
async function fingerprint(pool){const result={};for(const table of tables){const r=await pool.query(`SELECT count(*)::integer AS rows,md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) AS digest FROM public.${ident(table)} t`);result[table]=r.rows[0];}return result;}
async function drill(){
 const env=dotenv.parse(fs.readFileSync(path.join(__dirname,'../.env'),'utf8')),ownerEnv=dotenv.parse(fs.readFileSync(path.join(__dirname,'../.env.migrations'),'utf8'));
 if(!['localhost','127.0.0.1','[::1]'].includes(new URL(ownerEnv.DATABASE_URL).hostname))throw Error('Local restore drill only; production recovery must use an explicitly selected empty database');
 const started=Date.now(),owner=createPool(ownerEnv.DATABASE_URL,ownerEnv),name='pm_restore_drill_'+crypto.randomBytes(12).toString('hex');let restored,plain,created=false;
 try{
  // Pause writes briefly to fingerprint the exact snapshot without changing customer data.
  const lock=await owner.connect();let file,expected;
  try{await lock.query('BEGIN');await lock.query('LOCK TABLE '+tables.map(t=>'public.'+ident(t)).join(',')+' IN SHARE MODE');expected=await fingerprint(lock);file=await backupDatabase(env.DATABASE_URL,env);await lock.query('COMMIT');}catch(e){await lock.query('ROLLBACK');throw e;}finally{lock.release();}
  await owner.query('CREATE DATABASE '+ident(name)+' TEMPLATE template0');created=true;
  const url=new URL(ownerEnv.DATABASE_URL);url.pathname='/'+name;
  plain=path.join(path.dirname(file),name+'.dump');const raw=decryptBackup(file,env);fs.writeFileSync(plain,raw,{mode:0o600,flag:'wx'});raw.fill(0);
  restored=createPool(url.href,ownerEnv);await restored.query('DROP SCHEMA public');
  await runPg('pg_restore',['--exit-on-error','--no-owner','--no-acl','--dbname='+name,plain],url.href,ownerEnv);
  const actual=await fingerprint(restored);
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Restored table fingerprint mismatch');
  const broken=await restored.query('SELECT count(*)::integer AS n FROM orders WHERE total_cents<>subtotal_cents+delivery_cents');if(broken.rows[0].n!==0)throw Error('Restored totals do not match');
  const report={ok:true,elapsedSeconds:Math.round((Date.now()-started)/100)/10,tableFingerprintsMatched:tables.length,orderTotalsValid:true,backup:path.relative(path.join(__dirname,'..'),file),restoredDatabaseRemoved:true,productionRecoveryCertified:false};
  fs.writeFileSync(path.join(__dirname,'../.local/restore-drill.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{
  await restored?.end();if(plain&&fs.existsSync(plain))fs.unlinkSync(plain);
  if(created)await owner.query('DROP DATABASE '+ident(name));await owner.end();
 }
}
if(require.main===module)drill().catch(e=>{console.error('Restore drill failed:',e.code||e.message);process.exitCode=1;});
module.exports={fingerprint};
