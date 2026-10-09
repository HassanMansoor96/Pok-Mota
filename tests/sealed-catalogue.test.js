'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSealedCatalogue,isSealed,imageUrl}=require('../server/sealed-catalogue');
const box={productId:123,categoryId:3,name:'Silver Tempest Booster Box',imageUrl:'https://tcgplayer-cdn.tcgplayer.com/product/123_200w.jpg',extendedData:[]};
function fixture(){let calls=0;const catalogue=createSealedCatalogue(async url=>{calls++;return {ok:true,json:async()=>({success:true,results:url.endsWith('/prices')?[]:url.endsWith('groups')?[{groupId:3170,name:'Silver Tempest'}]:[box,{...box,productId:124,name:'Lugia',extendedData:[{name:'Number',value:'1/100'}]}]})};});return {catalogue,calls:()=>calls};}
test('search and selection fill sealed inventory fields and image, using cache',async()=>{const f=fixture();const data=await f.catalogue.search({set:'3170'});assert.equal(data.products.length,1);assert.equal(data.hasMore,false);const p=await f.catalogue.product('3170','123');assert.equal(p.category,'sealed');assert.equal(p.set,'Silver Tempest');assert.equal(p.condition,'Factory sealed');assert.equal(p.imageUrl,'https://tcgplayer-cdn.tcgplayer.com/product/123_in_1000x1000.jpg');assert.equal(f.calls(),3);});
test('filters singles and code cards even when names mention sealed formats',()=>{assert.equal(isSealed(box),true);assert.equal(isSealed({...box,extendedData:[{name:'Rarity',value:'Rare'}]}),false);assert.equal(isSealed({...box,name:'Booster Box Code Card'}),false);});
test('validates query types and IDs before requests',async()=>{const c=createSealedCatalogue(()=>{throw Error('must not fetch');});await assert.rejects(c.search({set:'../secret'}),{status:400});await assert.rejects(c.search({set:['3170']}),{status:400});await assert.rejects(c.search({name:['box']}),{status:400});await assert.rejects(c.product('3170','../123'),{status:400});});
test('does not accept external images or credentials',()=>{assert.equal(imageUrl('https://evil.example/image.jpg'),'');assert.equal(imageUrl('https://user:password@tcgplayer-cdn.tcgplayer.com/a.jpg'),'');assert.equal(imageUrl(undefined),'');});
test('provider failures are retryable and malformed responses rejected',async()=>{const c=createSealedCatalogue(async()=>({ok:false,status:429}));await assert.rejects(c.sets(),{status:503});const bad=createSealedCatalogue(async()=>({ok:true,json:async()=>({success:false,results:[]})}));await assert.rejects(bad.sets(),/Invalid catalogue/);});
test('unknown products and sets return not found',async()=>{const {catalogue}=fixture();await assert.rejects(catalogue.product('3170','999'),{status:404});await assert.rejects(catalogue.search({set:'999'}),{status:404});});

test('sealed prices match product IDs and convert to ZAR with provider metadata',async()=>{
 const catalogue=createSealedCatalogue(async url=>({ok:true,json:async()=>url.includes('frankfurter')?{rate:18.5,date:new Date().toISOString().slice(0,10)}:{success:true,updated:new Date().toISOString(),results:url.endsWith('groups')?[{groupId:3170,name:'Silver Tempest'}]:url.endsWith('/prices')?[{productId:123,subTypeName:'Normal',marketPrice:100},{productId:999,subTypeName:'Normal',marketPrice:999}]:[box]}}));
 const p=await catalogue.product('3170','123');assert.deepEqual(p.cardMetadata,{provider:'tcgcsv',id:'123',setId:'3170'});assert.equal(p.marketPrices.length,1);assert.equal(p.marketPrices[0].zarCents,185000);assert.equal(p.marketPrices[0].stale,false);
});
test('pricing failures preserve sealed product details',async()=>{
 const catalogue=createSealedCatalogue(async url=>{if(url.endsWith('/prices'))throw Error('offline');return {ok:true,json:async()=>({success:true,results:url.endsWith('groups')?[{groupId:3170,name:'Silver Tempest'}]:[box]})};});
 const p=await catalogue.product('3170','123');assert.equal(p.name,box.name);assert.deepEqual(p.marketPrices,[]);
});
