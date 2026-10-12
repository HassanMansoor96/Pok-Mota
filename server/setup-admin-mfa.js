'use strict';
// Generates enrollment material locally; never logs or enables the secret.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),dotenv=require('dotenv');
const root=path.join(__dirname,'..'),file=path.join(root,'.env'),env=dotenv.parse(fs.readFileSync(file,'utf8'));
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,secret='';
for(const byte of crypto.randomBytes(20)){value=(value<<8)|byte;bits+=8;while(bits>=5){secret+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
if(env.ADMIN_TOTP_SECRET)secret=env.ADMIN_TOTP_SECRET;
else fs.appendFileSync(file,'\nADMIN_TOTP_SECRET='+secret+'\nADMIN_TOTP_ENABLED=false\n');
const folder=path.join(root,'.local');fs.mkdirSync(folder,{recursive:true,mode:0o700});
const issuer=env.STORE_NAME||'Collector Store',label=issuer+':'+env.ADMIN_USERNAME;
fs.writeFileSync(path.join(folder,'admin-mfa-enrollment.txt'),'Authenticator manual setup key: '+secret+'\nEnrollment URI: otpauth://totp/'+encodeURIComponent(label)+'?secret='+secret+'&issuer='+encodeURIComponent(issuer)+'&algorithm=SHA1&digits=6&period=30\n',{mode:0o600});
console.log('Enrollment material saved to ignored .local/admin-mfa-enrollment.txt. Add it to your authenticator privately, then set ADMIN_TOTP_ENABLED=true. MFA was not enabled and no secret was printed.');
