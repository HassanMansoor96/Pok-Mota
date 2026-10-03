'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile);
function pgEnvironment(connectionString,env=process.env){
 const u=new URL(connectionString),local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 if(!local&&env.DATABASE_SSL!=='true')throw Error('Remote backup requires verified database TLS');
 return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:env.DATABASE_SSL==='true'?'verify-full':'disable',...(env.PGSSLROOTCERT?{PGSSLROOTCERT:env.PGSSLROOTCERT}:{})};
}
function pgTool(name,env=process.env){
 if(env.PG_BIN)return path.join(env.PG_BIN,name+(process.platform==='win32'?'.exe':''));
 if(process.platform==='win32'){const root='C:/Program Files/PostgreSQL';if(fs.existsSync(root)){for(const version of fs.readdirSync(root).sort((a,b)=>Number(b)-Number(a))){const file=path.join(root,version,'bin',name+'.exe');if(fs.existsSync(file))return file;}}}
 return name;
}
async function runPg(name,args,connectionString,env=process.env){
 try{await exec(pgTool(name,env),args,{env:pgEnvironment(connectionString,env),timeout:120000,maxBuffer:1024*1024,windowsHide:true});}catch{throw Error(name+' failed; check client version, connection permissions and verified TLS (details withheld)');}
}
function keyFrom(env){if(!/^[0-9a-f]{64}$/.test(env.BACKUP_ENCRYPTION_KEY||''))throw Error('Set a 32-byte hex BACKUP_ENCRYPTION_KEY and store a separate recovery copy');return Buffer.from(env.BACKUP_ENCRYPTION_KEY,'hex');}
async function backupDatabase(connectionString,env=process.env){
 const key=keyFrom(env),folder=path.resolve(__dirname,'../.local/backups');fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const name=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(6).toString('hex'),plain=path.join(folder,name+'.dump'),file=plain+'.enc';
 try{
  await runPg('pg_dump',['--format=custom','--no-owner','--no-acl','--schema=public','--file='+plain],connectionString,env);
  const raw=fs.readFileSync(plain),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(raw),cipher.final()]);raw.fill(0);
  const data=Buffer.concat([Buffer.from('PMB1'),iv,cipher.getAuthTag(),ciphertext]);fs.writeFileSync(file,data,{mode:0o600,flag:'wx'});
  fs.writeFileSync(file+'.json',JSON.stringify({format:'PMB1/AES-256-GCM',createdAt:new Date().toISOString(),sha256:crypto.createHash('sha256').update(data).digest('hex'),bytes:data.length},null,2),{mode:0o600,flag:'wx'});
  return file;
 }finally{key.fill(0);if(fs.existsSync(plain))fs.unlinkSync(plain);}
}
function decryptBackup(file,env=process.env){
 const data=fs.readFileSync(file),manifest=JSON.parse(fs.readFileSync(file+'.json','utf8'));
 if(crypto.createHash('sha256').update(data).digest('hex')!==manifest.sha256||data.subarray(0,4).toString()!=='PMB1')throw Error('Backup integrity check failed');
 const key=keyFrom(env);try{const decipher=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(4,16));decipher.setAuthTag(data.subarray(16,32));return Buffer.concat([decipher.update(data.subarray(32)),decipher.final()]);}finally{key.fill(0);}
}
if(require.main===module){require('dotenv').config({quiet:true});backupDatabase(process.env.DATABASE_URL).then(file=>console.log('Encrypted local backup created: '+path.relative(process.cwd(),file))).catch(e=>{console.error('Backup failed:',e.message);process.exitCode=1;});}
module.exports={backupDatabase,decryptBackup,runPg};
