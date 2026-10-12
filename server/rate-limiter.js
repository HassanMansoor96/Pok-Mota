'use strict';
const crypto=require('node:crypto'),rateLimit=require('express-rate-limit');
class PostgresRateLimitStore{
 constructor(pool,bucket){this.pool=pool;this.bucket=bucket;this.localKeys=false;this.prefix=bucket;}
 init(options){this.windowMs=options.windowMs;}
 hash(key){return crypto.createHash('sha256').update(this.bucket+':'+key).digest('hex');}
 async increment(key){
  const r=await this.pool.query(`INSERT INTO rate_limit_counters(bucket,key_hash,hits,expires_at)
   VALUES($1,$2,1,now()+($3::bigint*interval '1 millisecond'))
   ON CONFLICT(bucket,key_hash) DO UPDATE SET
   hits=CASE WHEN rate_limit_counters.expires_at<=now() THEN 1 ELSE rate_limit_counters.hits+1 END,
   expires_at=CASE WHEN rate_limit_counters.expires_at<=now() THEN EXCLUDED.expires_at ELSE rate_limit_counters.expires_at END
   RETURNING hits,expires_at`,[this.bucket,this.hash(key),this.windowMs]);
  return {totalHits:r.rows[0].hits,resetTime:new Date(r.rows[0].expires_at)};
 }
 async decrement(key){await this.pool.query('UPDATE rate_limit_counters SET hits=GREATEST(0,hits-1) WHERE bucket=$1 AND key_hash=$2',[this.bucket,this.hash(key)]);}
 async resetKey(key){await this.pool.query('DELETE FROM rate_limit_counters WHERE bucket=$1 AND key_hash=$2',[this.bucket,this.hash(key)]);}
}
function limiter(pool,bucket,options){return rateLimit({...options,...(process.env.NODE_ENV==='production'?{store:new PostgresRateLimitStore(pool,bucket)}:{})});}
module.exports={limiter,PostgresRateLimitStore};
