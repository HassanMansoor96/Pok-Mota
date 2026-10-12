'use strict';
// Owner-only local recovery. Input comes from a protected file/stdin, never argv.
const fs=require('node:fs'),path=require('node:path'),{hashPassword}=require('./customers');
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));if(typeof input.password!=='string'||input.password.length<16||input.password.length>128)throw Error('Choose a password between 16 and 128 characters');
 const file=path.join(__dirname,'../.env'),hash=await hashPassword(input.password);let env=fs.readFileSync(file,'utf8');
 env=env.replace(/^ADMIN_PASSWORD_HASH=.*$/m,'ADMIN_PASSWORD_HASH='+hash).replace(/^ADMIN_PASSWORD=.*\r?\n?/m,'');
 if(!/^ADMIN_PASSWORD_HASH=/m.test(env))env+='\nADMIN_PASSWORD_HASH='+hash+'\n';fs.writeFileSync(file,env,{mode:0o600});
 console.log('Local admin password hash updated. Restart the app; existing admin sessions become invalid. Authenticator MFA remains unchanged. No credential printed.');
})().catch(()=>{console.error('Admin recovery failed; check protected input and local configuration.');process.exitCode=1;});
