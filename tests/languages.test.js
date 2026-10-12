'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createCatalogue} = require('../server/card-catalogue');
const {createSealedCatalogue} = require('../server/sealed-catalogue');
const {validateMetadata} = require('../server/card-metadata');
const {searchName}=require('../server/card-search-names');

test('English names find native printings and suffixes do not hide other variants',()=>{
  assert.equal(searchName('Pikachu','ja'),'ピカチュウ');
  assert.equal(searchName('Charizard ex','zh-cn'),'喷火龙');
  assert.equal(searchName('Charizard','zh-tw'),'噴火龍');
  assert.equal(searchName('ピカチュウ','ja'),'ピカチュウ');
  assert.equal(searchName('Rare Candy','ja'),'Rare Candy');
});
test('Asian lookup translates upstream queries and accepts card numbers within sets',async()=>{
  let queried;
  const cards=createCatalogue(async url=>{queried=url;return {ok:true,json:async()=>url.includes('/sets/')?{cards:[{id:'SV8-025',localId:'025',name:'皮卡丘'}]}:[{id:'SV8-025',localId:'025',name:'皮卡丘'}]};});
  const translated=await cards.search({name:'Pikachu',language:'zh-cn'});assert.equal(new URL(queried).searchParams.get('name'),'皮卡丘');assert.equal(translated.searchName,'皮卡丘');
  assert.equal((await cards.search({name:'25/100',set:'SV8',language:'zh-cn'})).cards.length,1);
  assert.equal((await cards.search({name:'#025',set:'SV8',language:'zh-cn'})).cards.length,1);
  await cards.search({name:'夢',language:'ja'});
});

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
