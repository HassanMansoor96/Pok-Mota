'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createPool}=require('./database-config');
const migrationFiles=['schema.sql','orders.sql','customers.sql','payments.sql','operations.sql'];
async function migrate(pool){const db=await pool.connect();try{await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtext('pokemota-schema-migrations'))");for(const file of migrationFiles)await db.query(fs.readFileSync(path.join(__dirname,file),'utf8'));await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
if(require.main===module){require('dotenv').config({path:fs.existsSync(path.join(__dirname,'../.env.migrations'))?path.join(__dirname,'../.env.migrations'):path.join(__dirname,'../.env'),quiet:true});const pool=createPool(process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL);migrate(pool).then(()=>console.log('Database migrations applied atomically; existing stock and orders preserved.')).catch(e=>{console.error('Database initialization failed:',e.code||'internal');process.exitCode=1;}).finally(()=>pool.end());}
module.exports={migrate,migrationFiles};
