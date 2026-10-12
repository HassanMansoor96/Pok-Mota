'use strict';
// Operator-only. Does not send messages or reset any password by itself.
require('dotenv').config({quiet:true});
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pool=require('./db'),{issueRecovery}=require('./account-security');
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));if(input.identityVerified!==true||typeof input.email!=='string')throw Error('Verify ownership through an established channel and provide identityVerified=true');
 const origin=new URL(process.env.PUBLIC_ORIGIN);if(origin.origin!==process.env.PUBLIC_ORIGIN||(origin.protocol!=='https:'&&process.env.NODE_ENV==='production'))throw Error('Set a valid store origin');
 const folder=path.join(__dirname,'../.local/recovery');fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const token=await issueRecovery(pool,input.email),file=path.join(folder,crypto.randomBytes(12).toString('hex')+'.txt');
 fs.writeFileSync(file,origin.origin+'/account.html#reset='+token+'\n',{flag:'wx',mode:0o600});
 console.log('A single-use recovery link was written to a private local recovery file. It expires in 30 minutes. No token was printed or message sent. Deliver only through the verified channel, then remove the file.');
})().catch(e=>{console.error('Recovery issuance failed:',e.code||'check verified input and account');process.exitCode=1;}).finally(()=>pool.end());
