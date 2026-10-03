'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{totp,matchStep}=require('../server/totp');
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
test('TOTP matches RFC 6238 SHA-1 vectors',()=>{for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(totp(secret,seconds*1000,8),expected);});
test('TOTP permits one clock step and rejects stale or malformed codes',()=>{const now=1234567890000;assert.equal(matchStep(secret,totp(secret,now),now),Math.floor(now/30000));assert.equal(matchStep(secret,totp(secret,now-30000),now),Math.floor(now/30000)-1);assert.equal(matchStep(secret,totp(secret,now-120000),now),null);assert.equal(matchStep(secret,'123',now),null);assert.throws(()=>totp('invalid',now));});
