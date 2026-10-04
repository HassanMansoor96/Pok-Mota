'use strict';
// Operator-only provisioning. Never run with the owner URL in the web service.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createPool,assertRuntimeRole}=require('./database-config');
const {migrate}=require('./init-db'),{grantRuntime}=require('./provision-runtime');
async function deployDatabase(env){
 if(env.DATABASE_SSL!=='true')throw Error('Hosted provisioning requires verified TLS');
 const owner=new URL(env.MIGRATION_DATABASE_URL);
 if(['localhost','127.0.0.1','[::1]'].includes(owner.hostname))throw Error('Use db:init and db:runtime for local development');
 const target=path.join(__dirname,'../.local/render-runtime.env');
 if(fs.existsSync(target))throw Error('Runtime credential file already exists; retain it and use db:init for later migrations');
 const role='pm_runtime_'+crypto.randomBytes(6).toString('hex'),password=crypto.randomBytes(32).toString('hex');
 const pool=createPool(owner.href,env);let runtime;
 try{
  await migrate(pool);
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query("SET LOCAL password_encryption='scram-sha-256'");
   await db.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`);
   await grantRuntime(db,role);
   await db.query(`ALTER ROLE "${role}" SET search_path TO public`);
   await db.query(`ALTER ROLE "${role}" SET statement_timeout TO '20s'`);
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  owner.username=role;owner.password=password;
  runtime=createPool(owner.href,env);await assertRuntimeRole(runtime);
  await runtime.query('SELECT id FROM products LIMIT 0');
  fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
  fs.writeFileSync(target,'# Secret runtime credential; paste DATABASE_URL into Render, never into Git.\nDATABASE_URL='+JSON.stringify(owner.href)+'\nDATABASE_SSL=true\n',{mode:0o600,flag:'wx'});
  console.log('Database migrated and restricted role verified. Credential saved privately to .local/render-runtime.env; no secrets printed.');
 }finally{await runtime?.end();await pool.end();}
}
if(require.main===module){
 require('dotenv').config({path:path.join(__dirname,'../.env.deploy'),quiet:true});
 deployDatabase(process.env).catch(e=>{console.error('Hosted database setup failed:',e.code||e.message);process.exitCode=1;});
}
module.exports={deployDatabase};
