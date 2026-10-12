'use strict';
const {confirmPayment}=require('./payments');
function mountOperations(app,pool,auth,csrf,token,payments){
 const wrap=fn=>async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{await fn(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}};
 app.get('/api/admin/operations',auth,wrap(async(req,res)=>{
  const r=await pool.query(`SELECT count(*) FILTER(WHERE status='pending_payment')::integer AS pending_orders,
   count(*) FILTER(WHERE status='pending_payment' AND created_at<now()-interval '48 hours')::integer AS overdue_orders,
   count(*) FILTER(WHERE status='pending_payment' AND payment_method='paystack' AND payment_checked_at IS NULL)::integer AS unchecked_paystack_orders FROM orders`);
  res.json({...r.rows[0],paymentEnvironment:payments.mode||'sandbox',checkoutOpen:process.env.NODE_ENV!=='production'||(process.env.CHECKOUT_ENABLED==='true'&&process.env.POLICIES_APPROVED==='true')});
 }));
 app.post('/api/admin/orders/:id/reconcile',csrf,auth,token,wrap(async(req,res)=>{
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.status(404).json({error:'Order not found.'});
  const db=await pool.connect();try{await db.query('BEGIN');
   const found=await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[req.params.id]);if(!found.rowCount){await db.query('ROLLBACK');return res.status(404).json({error:'Order not found.'});}
   const order=found.rows[0],verified=await payments.verify(order);
   if(verified.payment)await confirmPayment(db,order,'paystack',verified.payment);
   await db.query('UPDATE orders SET payment_checked_at=now(),payment_provider_status=$2,updated_at=now() WHERE id=$1',[order.id,verified.status]);
   await db.query('COMMIT');res.json({ok:true,providerStatus:verified.status,status:verified.payment&&order.status==='pending_payment'?'paid':order.status});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }));
}
async function cleanupExpired(pool){
 const totals={};for(const table of ['admin_sessions','customer_sessions','account_recovery_tokens','rate_limit_counters','admin_totp_used']){const r=await pool.query(`DELETE FROM ${table} WHERE expires_at<=now()`);totals[table]=r.rowCount;}return totals;
}
// EFT expiry is deliberately opt-in. Online stock is NEVER returned automatically.
async function expireEftOrders(pool,hours){
 if(!Number.isInteger(hours)||hours<24||hours>720)throw Error('Choose an EFT expiry between 24 and 720 hours');
 const db=await pool.connect();try{await db.query('BEGIN');
  const found=await db.query("SELECT * FROM orders WHERE status='pending_payment' AND payment_method='eft' AND created_at<now()-($1::integer*interval '1 hour') ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED",[hours]);
  // All product locks are ordered across the whole batch to avoid lock cycles.
  const stock=new Map();for(const order of found.rows)for(const item of order.items)stock.set(item.id,(stock.get(item.id)||0)+item.quantity);
  for(const [id,quantity] of [...stock].sort(([a],[b])=>a.localeCompare(b)))await db.query('UPDATE products SET stock=stock+$2,updated_at=now() WHERE id=$1',[id,quantity]);
  for(const order of found.rows)await db.query("UPDATE orders SET status='cancelled',cancellation_reason='eft_expired',updated_at=now() WHERE id=$1",[order.id]);
  await db.query('COMMIT');return found.rowCount;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
module.exports={mountOperations,cleanupExpired,expireEftOrders};
