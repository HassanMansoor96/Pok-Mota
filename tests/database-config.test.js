'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createPool,assertRuntimeRole}=require('../server/database-config');
test('verified database TLS cannot be overridden by URI SSL options',async()=>{
 const pool=createPool('postgres://fixture:fixture@localhost/store?sslmode=no-verify&sslrootcert=fixture',{DATABASE_SSL:'true'});
 assert.equal(pool.options.ssl.rejectUnauthorized,true);assert.equal(new URL(pool.options.connectionString).searchParams.has('sslmode'),false);assert.equal(new URL(pool.options.connectionString).searchParams.has('sslrootcert'),false);await pool.end();
});
test('runtime privilege guard rejects owner membership and elevated database capabilities',async()=>{
 const flags={rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,database_create:false,schema_create:false,owns_tables:false,elevated_membership:false};
 await assertRuntimeRole({query:async()=>({rows:[flags]})});
 for(const key of Object.keys(flags))await assert.rejects(()=>assertRuntimeRole({query:async()=>({rows:[{...flags,[key]:true}]})}));
});
