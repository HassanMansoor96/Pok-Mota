'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {decryptBackup}=require('../server/backup');
test('encrypted backup rejects a wrong key and tampering even with a rewritten checksum',t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pm-backup-test-'));const file=path.join(folder,'fixture.enc');t.after(()=>{fs.unlinkSync(file);fs.unlinkSync(file+'.json');fs.rmdirSync(folder);});
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),raw=Buffer.from('isolated fixture only'),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([Buffer.from('PMB1'),iv,Buffer.alloc(16),cipher.update(raw),cipher.final()]);cipher.getAuthTag().copy(data,16);
 const write=()=>{fs.writeFileSync(file,data);fs.writeFileSync(file+'.json',JSON.stringify({sha256:crypto.createHash('sha256').update(data).digest('hex')}));};write();
 const env={BACKUP_ENCRYPTION_KEY:key.toString('hex')};assert.deepEqual(decryptBackup(file,env),raw);assert.throws(()=>decryptBackup(file,{BACKUP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex')}));
 data[data.length-1]^=1;write();assert.throws(()=>decryptBackup(file,env));
});
