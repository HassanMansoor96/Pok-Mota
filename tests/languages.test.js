'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createCatalogue} = require('../server/card-catalogue');
const {createSealedCatalogue} = require('../server/sealed-catalogue');
const {validateMetadata} = require('../server/card-metadata');

test('card languages have separate caches and preserve the printing language', async () => {
  const calls=[];
  const catalogue=createCatalogue(async url=>{
    calls.push(url);
    const language=new URL(url).pathname.split('/')[2];
    return {ok:true,json:async()=>({id:'set-1',name:language,set:{name:'Set'},pricing:{tcgplayer:{normal:{marketPrice:100}}}})};
  });
  for(const language of ['ja','zh-cn','zh-tw']) {
    const result=await catalogue.card('set-1',language);
    assert.equal(result.name,language);
    assert.equal(result.cardMetadata.language,language);
    assert.deepEqual(result.marketPrices,[]);
    await catalogue.card('set-1',language);
  }
  assert.equal(calls.length,3);
});

test('unsupported language query values are rejected before contacting a provider', async()=>{
  const fail=()=>{throw Error('must not fetch');};
  const cards=createCatalogue(fail),sealed=createSealedCatalogue(fail);
  for(const language of ['../en','zh',['ja'],null]) {
    await assert.rejects(cards.sets(language),{status:400});
    await assert.rejects(cards.card('set-1',language),{status:400});
    await assert.rejects(cards.search({name:'test',language}),{status:400});
    await assert.rejects(sealed.sets(language),{status:400});
  }
  await assert.rejects(sealed.search({set:'123',language:'zh-cn'}),/entered manually/);
});

test('Japanese sealed products use their own category and cache',async()=>{
  const calls=[];
  const catalogue=createSealedCatalogue(async url=>{
    calls.push(url);
    const categoryId=Number(new URL(url).pathname.split('/')[2]);
    return {ok:true,json:async()=>({success:true,results:url.endsWith('groups')?[{groupId:123,name:'Set'}]:url.endsWith('prices')?[]:[{categoryId,productId:456,name:'Booster Box',extendedData:[]}]})};
  });
  for(const language of ['en','ja']) {
    const result=await catalogue.product('123','456',language);
    assert.equal(result.cardMetadata.language,language);
  }
  assert.equal(calls.filter(url=>url.includes('/85/')).length,3);
  assert.equal(calls.filter(url=>url.includes('/3/')).length,3);
});

test('product metadata retains supported languages and defaults old records to English',()=>{
  assert.equal(validateMetadata({}).language,'en');
  for(const language of ['en','ja','zh-cn','zh-tw']) assert.equal(validateMetadata({language}).language,language);
  assert.throws(()=>validateMetadata({language:'invalid'}),/language/);
});
