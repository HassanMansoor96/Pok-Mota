'use strict';
const crypto = require('node:crypto');
const express = require('express');
const dns = require('node:dns/promises');
const rateLimit = require('express-rate-limit');
function fail(message, status = 400) { throw Object.assign(Error(message), {status}); }
function equal(a, b) {
 const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
 return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const encode = value => encodeURIComponent(String(value).trim()).replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+');
function payfastString(fields) {
 return Object.entries(fields).filter(([k, v]) => k !== 'signature' && v !== '').map(([k, v]) => `${encode(k)}=${encode(v)}`).join('&');
}
function payfastSignature(fields, passphrase) {
 return crypto.createHash('md5').update(payfastString(fields) + (passphrase ? '&passphrase=' + encode(passphrase) : '')).digest('hex');
}
function stripeSignature(raw, header, secret, now = Date.now()) {
 const parts = String(header || '').split(',').map(x => x.split('='));
 const timestamp = parts.find(x => x[0] === 't')?.[1];
 if (!/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
 const expected = crypto.createHmac('sha256', secret).update(timestamp + '.').update(raw).digest('hex');
 return parts.some(([key, value]) => key === 'v1' && equal(value, expected));
}
function createPayments(env = process.env, fetcher = fetch, lookup = dns.lookup) {
 let origin = null;
 try { const u = new URL(env.PUBLIC_ORIGIN); if (u.origin === env.PUBLIC_ORIGIN && (u.protocol === 'https:' || (env.NODE_ENV !== 'production' && u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname)))) origin = u.origin; } catch {}
 const paymentMode=env.PAYMENT_MODE||'sandbox';
 if(!['sandbox','live'].includes(paymentMode))throw Error('PAYMENT_MODE must be sandbox or live');
 if(env.PAYSTACK_SECRET_KEY){const prefix=paymentMode==='sandbox'?'sk_test_':'sk_live_';if(!env.PAYSTACK_SECRET_KEY.startsWith(prefix))throw Error('Paystack key does not match PAYMENT_MODE');if(paymentMode==='live'&&env.PAYSTACK_LIVE_READY!=='true')throw Error('Live Paystack requires completed sandbox sign-off and PAYSTACK_LIVE_READY=true');}
 const enabled = {eft: true, payfast: !!(origin && env.PAYFAST_MERCHANT_ID && env.PAYFAST_MERCHANT_KEY && env.PAYFAST_PASSPHRASE), paystack: !!(origin && env.PAYSTACK_SECRET_KEY), stripe: !!(origin && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET)};
 const labels = {eft: 'Bank transfer (EFT)', payfast: 'PayFast', paystack: 'Paystack', stripe: 'Stripe'};
 const host = env.PAYFAST_SANDBOX === 'true' ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';
 const methods = () => Object.entries(enabled).filter(([, v]) => v).map(([id]) => ({id, label: labels[id]}));
 function requireMethod(id) { if (!enabled[id] || !Object.hasOwn(enabled, id)) fail('This payment option is unavailable. Please choose another.'); return id; }
 const returnUrl = (o, result) => `${origin}/checkout.html?order=${encodeURIComponent(o.reference)}&payment=${result}`;
 async function request(url, options) {
  const response = await fetcher(url, {...options, signal: AbortSignal.timeout(15000)});
  const body = await response.json();
  if (!response.ok) fail('Payment provider is unavailable. Your order is saved; retry payment shortly.', 502);
  return body;
 }
 function safeUrl(value, hostname) {
  let u; try { u = new URL(value); } catch { fail('Payment provider returned an invalid checkout.', 502); }
  if (u.protocol !== 'https:' || u.hostname !== hostname || u.username || u.password) fail('Payment provider returned an invalid checkout.', 502);
  return u.href;
 }
 async function start(o) {
  const provider = requireMethod(o.payment_method);
  if (provider === 'payfast') {
   const fields = {merchant_id: env.PAYFAST_MERCHANT_ID, merchant_key: env.PAYFAST_MERCHANT_KEY, return_url: returnUrl(o, 'returned'), cancel_url: returnUrl(o, 'cancelled'), notify_url: origin + '/api/payments/webhooks/payfast', email_address: o.customer.email, m_payment_id: o.reference, amount: (o.total_cents / 100).toFixed(2), item_name: (env.STORE_NAME || 'Pok?Mota') + ' order ' + o.reference};
   fields.signature = payfastSignature(fields, env.PAYFAST_PASSPHRASE);
   return {id: o.reference, url: `https://${host}/eng/process`, fields};
  }
  if (provider === 'paystack') {
   // Recover initialization whose response may have been lost before it reached our database.
   const check = await fetcher('https://api.paystack.co/transaction/verify/' + encodeURIComponent(o.reference), {headers: {Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY}, signal: AbortSignal.timeout(15000)});
   if (check.ok) {
    const verified = await check.json();
    if (verified.status && verified.data?.reference === o.reference && verified.data.amount === o.total_cents && verified.data.currency === 'ZAR') {
     if (verified.data.status === 'success') fail('Payment received. Wait for confirmation and refresh the order.', 409);
     // Never issue a second transaction if an earlier initialization response was lost.
     fail('A payment already exists for this order. Contact the store to recover its checkout link.', 409);
    }
   } else if (check.status !== 404 && check.status !== 400) fail('Unable to check this payment. Please retry shortly.', 502);
   const body = await request('https://api.paystack.co/transaction/initialize', {method: 'POST', headers: {Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json'}, body: JSON.stringify({email: o.customer.email, amount: o.total_cents, currency: 'ZAR', reference: o.reference, callback_url: returnUrl(o, 'returned')})});
   if (!body.status || body.data?.reference !== o.reference) fail('Unable to start payment. Please retry shortly.', 502);
   return {id: o.reference, url: safeUrl(body.data.authorization_url, 'checkout.paystack.com')};
  }
  if (Date.now() - new Date(o.created_at).getTime() > 23 * 60 * 60 * 1000) fail('This payment attempt needs store assistance. Contact us with your order reference.', 409);
  const params = new URLSearchParams({mode: 'payment', customer_email: o.customer.email, client_reference_id: o.reference, 'metadata[orderReference]': o.reference, success_url: returnUrl(o, 'returned'), cancel_url: returnUrl(o, 'cancelled'), 'line_items[0][price_data][currency]': 'zar', 'line_items[0][price_data][unit_amount]': String(o.total_cents), 'line_items[0][price_data][product_data][name]': 'PokeMota order ' + o.reference, 'line_items[0][quantity]': '1'});
  const body = await request('https://api.stripe.com/v1/checkout/sessions', {method: 'POST', headers: {Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': o.reference}, body: params.toString()});
  if (!body.id) fail('Unable to start payment.', 502);
  return {id: body.id, url: safeUrl(body.url, 'checkout.stripe.com')};
 }
 async function notification(provider, req) {
  requireMethod(provider);
  const raw = req.body;
  if (!Buffer.isBuffer(raw)) fail('Invalid notification.', 400);
  if (provider === 'payfast') {
   const entries = [...new URLSearchParams(raw.toString('utf8'))];
   if (new Set(entries.map(([k]) => k)).size !== entries.length) fail('Invalid notification.', 400);
   const data = Object.fromEntries(entries);
   if (!equal(data.signature, payfastSignature(data, env.PAYFAST_PASSPHRASE)) || data.merchant_id !== env.PAYFAST_MERCHANT_ID) fail('Invalid signature.', 401);
   const addresses = await Promise.all(['www.payfast.co.za','w1w.payfast.co.za','w2w.payfast.co.za','sandbox.payfast.co.za'].map(async hostname => {try{return await lookup(hostname,{all:true});}catch{return [];}}));
   const ip = String(req.ip || '').replace(/^::ffff:/, '');
   if (!addresses.flat().some(x => x.address === ip)) fail('Invalid notification source.', 401);
   const response = await fetcher(`https://${host}/eng/query/validate`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: payfastString(data), signal: AbortSignal.timeout(15000)});
   if (!response.ok || (await response.text()).trim() !== 'VALID') fail('Unable to validate notification.', 502);
   if (data.payment_status !== 'COMPLETE') return null;
   if (!/^\d+\.\d{2}$/.test(data.amount_gross || '') || !data.pf_payment_id) fail('Invalid payment data.');
   return {reference: data.m_payment_id, amount: Math.round(Number(data.amount_gross) * 100), currency: 'ZAR', id: data.m_payment_id, transaction: data.pf_payment_id};
  }
  if (provider === 'paystack') {
   const expected = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
   if (!equal(req.get('x-paystack-signature'), expected)) fail('Invalid signature.', 401);
  } else if (!stripeSignature(raw, req.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET)) fail('Invalid signature.', 401);
  let event; try { event = JSON.parse(raw.toString('utf8')); } catch { fail('Invalid notification.'); }
  if (provider === 'paystack') {
   if (event.event !== 'charge.success' || event.data?.status !== 'success') return null;
   if(event.data.domain!==(paymentMode==='sandbox'?'test':'live')||!Number.isSafeInteger(event.data.id)||event.data.id<=0)fail('Invalid payment environment or transaction.',409);
   return {reference: event.data.reference, amount: event.data.amount, currency: event.data.currency, id: event.data.reference, transaction: String(event.data.id)};
  }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return null;
  const session = event.data?.object;
  if (session?.payment_status !== 'paid' || session.mode !== 'payment') return null;
  return {reference: session.client_reference_id, amount: session.amount_total, currency: String(session.currency).toUpperCase(), id: session.id, transaction: session.payment_intent};
 }
 async function verify(o){
  if(o.payment_method!=='paystack')fail('Server reconciliation is available for Paystack orders only.',409);
  requireMethod('paystack');
  const body=await request('https://api.paystack.co/transaction/verify/'+encodeURIComponent(o.reference),{headers:{Authorization:'Bearer '+env.PAYSTACK_SECRET_KEY}});
  const data=body.data;
  if(!body.status||!data||data.reference!==o.reference||data.amount!==o.total_cents||data.currency!=='ZAR'||data.domain!==(paymentMode==='sandbox'?'test':'live'))fail('Provider verification does not match order.',409);
  if(!['success','abandoned','failed','ongoing','pending','processing','queued','reversed'].includes(data.status))fail('Unexpected provider status.',502);
  const payment=data.status==='success'?{reference:data.reference,amount:data.amount,currency:data.currency,id:data.reference,transaction:Number.isSafeInteger(data.id)&&data.id>0?String(data.id):null}:null;
  if(payment&&!payment.transaction)fail('Invalid provider transaction.',409);
  return {status:data.status,payment};
 }
 return {methods, requireMethod, start, notification,verify,mode:paymentMode};
}
async function confirmPayment(db,order,provider,payment){
 if(!payment||!/^PM-[A-F0-9]{20}$/.test(payment.reference||'')||!Number.isSafeInteger(payment.amount)||typeof payment.transaction!=='string'||!payment.transaction||payment.transaction.length>128||payment.currency!=='ZAR')fail('Invalid payment data.');
 if(order.reference!==payment.reference)fail('Payment does not match order.',409);
   if (order.payment_method !== provider || order.total_cents !== payment.amount || (order.payment_checkout?.id && order.payment_checkout.id !== payment.id)) fail('Payment does not match order.', 409);
   if (['paid', 'fulfilled'].includes(order.status)) {
    if (order.payment_transaction !== payment.transaction) fail('Different payment received for an already paid order.', 409);
   } else {
    if (order.status !== 'pending_payment') fail('Order cannot receive payment.', 409);
    await db.query("UPDATE orders SET status='paid',payment_transaction=$2,paid_at=now(),updated_at=now() WHERE id=$1", [order.id, payment.transaction]);
   }

}
function mountPaymentWebhooks(app, pool, payments) {
 app.post('/api/payments/webhooks/:provider', require('./rate-limiter').limiter(pool,'webhooks',{windowMs: 60000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false}), express.raw({type: ['application/json', 'application/x-www-form-urlencoded'], limit: '100kb'}), async (req, res) => {
  let db;
  try {
   const provider = req.params.provider;
   if (!['payfast', 'paystack', 'stripe'].includes(provider)) fail('Not found.', 404);
   const payment = await payments.notification(provider, req);
   if (!payment) return res.sendStatus(200);
   if (!/^PM-[A-F0-9]{20}$/.test(payment.reference || '') || !Number.isSafeInteger(payment.amount) || !payment.transaction || payment.currency !== 'ZAR') fail('Invalid payment data.');
   db = await pool.connect(); await db.query('BEGIN');
   const result = await db.query('SELECT * FROM orders WHERE reference=$1 FOR UPDATE', [payment.reference]);
   if (!result.rowCount) fail('Order not found.', 404);
   const order = result.rows[0];
   await confirmPayment(db,order,provider,payment);
   await db.query('COMMIT'); res.sendStatus(200);
  } catch (e) {
   if (db) await db.query('ROLLBACK');
   console.error('Payment notification failed:', e.status || 'internal');
   res.status(e.status || 500).json({error: e.status ? e.message : 'Notification could not be processed.'});
  } finally { db?.release(); }
 });
}
module.exports = {createPayments, mountPaymentWebhooks, payfastSignature, payfastString, stripeSignature,confirmPayment};
