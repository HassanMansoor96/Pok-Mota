'use strict';
require('dotenv').config({quiet:true});const pool=require('./db'),{cleanupExpired,expireEftOrders}=require('./operations');
(async()=>{await cleanupExpired(pool);const hours=Number(process.env.EFT_ORDER_EXPIRY_HOURS||0);const expired=hours?await expireEftOrders(pool,hours):0;console.log(JSON.stringify({ok:true,expiredEftOrders:expired,onlineOrdersRestocked:false}));})().catch(e=>{console.error('Maintenance failed:',e.code||'configuration');process.exitCode=1;}).finally(()=>pool.end());
