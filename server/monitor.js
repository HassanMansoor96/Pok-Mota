'use strict';
require('dotenv').config({quiet:true});
const pool=require('./db');
(async()=>{
 const origin=new URL(process.env.PUBLIC_ORIGIN);if(origin.origin!==process.env.PUBLIC_ORIGIN)throw Error('Invalid store origin');
 const response=await fetch(origin.origin+'/api/health',{signal:AbortSignal.timeout(10000)});const body=await response.json();
 if(!response.ok||body.ok!==true)throw Error('Readiness check failed');
 const r=await pool.query("SELECT count(*)::integer AS overdue_orders FROM orders WHERE status='pending_payment' AND created_at<now()-interval '48 hours'");
 const alert=r.rows[0].overdue_orders>0;console.log(JSON.stringify({ok:!alert,health:true,overdueOrders:r.rows[0].overdue_orders,action:alert?'Review pending payments and reconcile before restocking':'none'}));if(alert)process.exitCode=1;
})().catch(()=>{console.error('Store monitoring failed; check application readiness and database connectivity.');process.exitCode=1;}).finally(()=>pool.end());
