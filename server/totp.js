'use strict';
const crypto=require('node:crypto');
function decodeBase32(secret){
 if(typeof secret!=='string'||! /^[A-Z2-7]{32,104}$/.test(secret))throw Error('Authenticator secret must be uppercase Base32, at least 160 bits');
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0;const bytes=[];
 for(const c of secret){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
 return Buffer.from(bytes);
}
function totp(secret,now=Date.now(),digits=6){
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
 const mac=crypto.createHmac('sha1',decodeBase32(secret)).update(counter).digest(),offset=mac[mac.length-1]&15;
 return String((mac.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');
}
function matchStep(secret,code,now=Date.now()){
 if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
 for(const offset of [0,-1,1]){const time=now+offset*30000;if(time<0)continue;const expected=totp(secret,time);if(crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(code)))return Math.floor(time/30000);}
 return null;
}
module.exports={totp,matchStep,decodeBase32};
