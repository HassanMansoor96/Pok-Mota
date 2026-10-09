'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dotenv=require('dotenv'),{createPool,assertRuntimeRole}=require('./database-config');
const tables=['products','orders','customers','customer_sessions','admin_sessions','rate_limit_counters','account_recovery_tokens','admin_totp_used'];
const ident=value=>'"'+value.replace(/"/g,'""')+'"';
async function grantRuntime(db,role,schema='public'){
 const database=(await db.query('SELECT current_database() AS name')).rows[0].name;
 await db.query(`REVOKE CREATE ON SCHEMA ${ident(schema)} FROM PUBLIC`);
 await db.query(`REVOKE CREATE,TEMPORARY ON DATABASE ${ident(database)} FROM PUBLIC`);
 await db.query(`GRANT CONNECT ON DATABASE ${ident(database)} TO ${ident(role)}`);
 await db.query(`GRANT USAGE ON SCHEMA ${ident(schema)} TO ${ident(role)}`);
 for(const table of tables)await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${ident(schema)}.${ident(table)} TO ${ident(role)}`);
}
async function provision(){
 const root=path.join(__dirname,'..'),envPath=path.join(root,'.env'),migrationPath=path.join(root,'.env.migrations');
 const original=fs.readFileSync(envPath,'utf8'),env=dotenv.parse(original);
 const ownerEnv=fs.existsSync(migrationPath)?dotenv.parse(fs.readFileSync(migrationPath,'utf8')):env;
 const ownerUrl=ownerEnv.DATABASE_URL;if(!['localhost','127.0.0.1','[::1]'].includes(new URL(ownerUrl).hostname))throw Error('This local provisioning command only changes a localhost database');
 const pool=createPool(ownerUrl,ownerEnv),db=await pool.connect();let runtime;
 try{
  const existing=env.DATABASE_RUNTIME_ROLE;const role=existing||'pm_runtime_'+crypto.randomBytes(6).toString('hex');
  if(!/^pm_runtime_[0-9a-f]{12}$/.test(role))throw Error('Unexpected runtime role name');
  const url=new URL(env.DATABASE_URL);const password=existing?decodeURIComponent(url.password):crypto.randomBytes(32).toString('hex');
  await db.query('BEGIN');
  if(!existing){await db.query("SET LOCAL password_encryption='scram-sha-256'");await db.query(`CREATE ROLE ${ident(role)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`);}
  await grantRuntime(db,role);
  await db.query(`ALTER ROLE ${ident(role)} SET search_path TO public`);
  await db.query(`ALTER ROLE ${ident(role)} SET statement_timeout TO '20s'`);
  await db.query('COMMIT');
  url.username=role;url.password=password;runtime=createPool(url.href,env);await assertRuntimeRole(runtime);
  await runtime.query('SELECT id FROM products LIMIT 0');
  const probe='permission_probe_'+crypto.randomBytes(6).toString('hex');let denied=false;
  try{await runtime.query(`CREATE TABLE public.${ident(probe)}(id integer)`);}catch(e){if(e.code==='42501')denied=true;else throw e;}
  if(!denied){await db.query(`DROP TABLE public.${ident(probe)}`);throw Error('Runtime role unexpectedly has DDL access');}
  if(!fs.existsSync(migrationPath))fs.writeFileSync(migrationPath,'# Local migration/restore owner credential. Never load this file into the web service.\nDATABASE_URL='+JSON.stringify(ownerUrl)+'\nDATABASE_SSL='+String(ownerEnv.DATABASE_SSL==='true')+'\n',{mode:0o600,flag:'wx'});
  let updated=original.replace(/^DATABASE_URL=.*$/m,'DATABASE_URL='+JSON.stringify(url.href));
  if(!existing)updated+='\nDATABASE_RUNTIME_ROLE='+role+'\n';
  fs.writeFileSync(envPath,updated,{mode:0o600});
  console.log('Local app switched to restricted runtime role. Read access works; schema/database creation, ownership and elevated role privileges are denied. Owner credential separated into ignored .env.migrations. No credentials printed.');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();await runtime?.end();await pool.end();}
}
if(require.main===module)provision().catch(e=>{console.error('Runtime provisioning failed:',e.code||e.message);process.exitCode=1;});
module.exports={grantRuntime,tables};
