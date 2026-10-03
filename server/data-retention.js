'use strict';
function retentionDays(value,label){const n=Number(value);if(!Number.isInteger(n)||n<90||n>3650)throw Error(label+' must be an approved period from 90 to 3650 days');return n;}
async function runRetention(pool,env,apply=false){
 if(!env.RETENTION_ORDER_DAYS||!env.RETENTION_ACCOUNT_DAYS){if(apply)throw Error('Approve and configure both retention periods before applying');return {configured:false,applied:false};}
 const ordersDays=retentionDays(env.RETENTION_ORDER_DAYS,'Order retention'),accountDays=retentionDays(env.RETENTION_ACCOUNT_DAYS,'Account retention');
 if(apply&&env.POLICIES_APPROVED!=='true')throw Error('Policies must be reviewed and approved before erasing customer data');
 const db=await pool.connect();try{
  await db.query('BEGIN');
  const orders=await db.query("SELECT id FROM orders WHERE status IN ('fulfilled','cancelled') AND updated_at<now()-($1::integer*interval '1 day') AND customer_erased_at IS NULL ORDER BY id FOR UPDATE",[ordersDays]);
  const accounts=await db.query("SELECT c.id FROM customers c WHERE c.last_active_at<now()-($1::integer*interval '1 day') AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.status IN ('pending_payment','paid')) ORDER BY c.id FOR UPDATE",[accountDays]);
  if(apply){
   for(const row of orders.rows)await db.query("UPDATE orders SET customer='{\"name\":\"Removed customer\"}'::jsonb,customer_erased_at=now() WHERE id=$1",[row.id]);
   for(const row of accounts.rows){await db.query('UPDATE orders SET customer_id=NULL WHERE customer_id=$1',[row.id]);await db.query('DELETE FROM customers WHERE id=$1',[row.id]);}
   await db.query('COMMIT');
  }else await db.query('ROLLBACK');
  return {configured:true,applied:apply,orderSnapshots:orders.rowCount,accounts:accounts.rowCount};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
if(require.main===module){require('dotenv').config({quiet:true});const pool=require('./db');runRetention(pool,process.env,process.argv.includes('--apply')).then(report=>console.log(JSON.stringify(report))).catch(e=>{console.error('Retention operation stopped:',e.code||e.message);process.exitCode=1;}).finally(()=>pool.end());}
module.exports={runRetention};
