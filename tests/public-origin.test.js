'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {configurePublicOrigin}=require('../server/public-origin');
test('Render URL enables initial HTTPS origin and explicit custom domain takes precedence',()=>{
 assert.equal(configurePublicOrigin({RENDER:'true',RENDER_EXTERNAL_URL:'https://pokemota.onrender.com/'}),'https://pokemota.onrender.com');
 assert.equal(configurePublicOrigin({PUBLIC_ORIGIN:'https://pokemota.hassanmansoor.co.za',RENDER:'true',RENDER_EXTERNAL_URL:'https://pokemota.onrender.com'}),'https://pokemota.hassanmansoor.co.za');
 assert.equal(configurePublicOrigin({}),undefined);
 assert.equal(configurePublicOrigin({RENDER_EXTERNAL_URL:'https://pokemota.onrender.com'}),undefined);
 for(const value of ['http://pokemota.onrender.com','https://onrender.com.evil.example','https://user:secret@pokemota.onrender.com'])assert.throws(()=>configurePublicOrigin({RENDER:'true',RENDER_EXTERNAL_URL:value}));
});
