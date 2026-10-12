'use strict';
const {Pool}=require('pg');
function createPool(connectionString,env=process.env,extra={}){
 if(!connectionString)throw Error('Database connection is required');
 const url=new URL(connectionString);
 if(env.DATABASE_SSL==='true')for(const key of ['sslmode','ssl','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 return new Pool({connectionString:url.href,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,...extra,ssl:env.DATABASE_SSL==='true'?{rejectUnauthorized:true,...(env.DATABASE_CA_CERT?{ca:env.DATABASE_CA_CERT}:{})}:undefined});
}
async function assertRuntimeRole(pool){
 const result=await pool.query(`SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,
  has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
  has_schema_privilege(current_user,'public','CREATE') AS schema_create,
  EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_tables,
  EXISTS(SELECT 1 FROM pg_roles elevated WHERE (elevated.rolsuper OR elevated.rolcreatedb OR elevated.rolcreaterole OR elevated.rolreplication OR elevated.rolbypassrls) AND pg_has_role(current_user,elevated.oid,'MEMBER')) AS elevated_membership
  FROM pg_roles r WHERE r.rolname=current_user`);
 const flags=result.rows[0];
 if(!flags||Object.values(flags).some(Boolean))throw Error('Runtime database role has elevated privileges; use the dedicated app role');
 if(process.env.NODE_ENV==='production'&&process.env.DATABASE_SSL!=='true')throw Error('Production requires certificate-verified database TLS');
}
module.exports={createPool,assertRuntimeRole};
