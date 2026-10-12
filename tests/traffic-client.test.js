'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../traffic.js'),'utf8');
test('all public pages include tracking and staff pages do not',()=>{
  for(const page of ['index','pokemota','catalogue','product','collections','about','faq','shipping','contact','privacy','checkout','account'])assert.match(fs.readFileSync(require.resolve('../'+page+'.html'),'utf8'),/src="traffic.js"/);
  for(const page of ['admin','inventory-preview'])assert.doesNotMatch(fs.readFileSync(require.resolve('../'+page+'.html'),'utf8'),/src="traffic.js"/);
});
function browser(overrides={}){
  const stored=new Map(),sent=[],listeners={},context={URL,location:{protocol:'https:',pathname:'/product.html',hostname:'store.example',search:'?id=private'},navigator:{},sessionStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},crypto:require('node:crypto'),document:{visibilityState:'visible',referrer:'https://google.com/search?q=private',addEventListener:(k,fn)=>listeners[k]=fn},window:{addEventListener:(k,fn)=>listeners[k]=fn},fetch:async(url,opts)=>{sent.push({url,opts,body:JSON.parse(opts.body)});return {};},...overrides};
  return {context,stored,sent,listeners,run:()=>vm.runInNewContext(source,context)};
}
test('client strips sensitive URLs and groups successive pages into a tab visit',()=>{
  const b=browser();b.run();assert.equal(b.sent[0].body.path,'/product.html');assert.equal(b.sent[0].body.referrer,'google.com');assert.equal(b.sent[0].opts.credentials,'omit');assert.equal(JSON.stringify(b.sent).includes('private'),false);
  const session=b.sent[0].body.session;b.context.location.pathname='/checkout.html';b.run();assert.equal(b.sent[1].body.session,session);assert.notEqual(b.sent[0].body.id,b.sent[1].body.id);
  b.stored.set('hm-traffic-visit',JSON.stringify({id:session,lastSeen:Date.now()-31*60*1000}));b.run();assert.notEqual(b.sent[2].body.session,session);
});
test('admin, privacy opt-outs, file previews and hidden preloads are not counted',()=>{
  for(const overrides of [{navigator:{doNotTrack:'1'}},{navigator:{globalPrivacyControl:true}},{location:{protocol:'file:',pathname:'/product.html'}},{location:{protocol:'https:',pathname:'/admin.html'}}]){const b=browser(overrides);b.run();assert.equal(b.sent.length,0);}
  const b=browser();b.context.document.visibilityState='hidden';b.run();assert.equal(b.sent.length,0);b.context.document.visibilityState='visible';b.listeners.visibilitychange();assert.equal(b.sent.length,1);b.listeners.visibilitychange();assert.equal(b.sent.length,1);
});
test('privacy storage restrictions never break the storefront or leak the full referrer',()=>{
  const b=browser({sessionStorage:{getItem:()=>{throw Error('disabled');},setItem:()=>{throw Error('disabled');}}});assert.doesNotThrow(b.run);assert.equal(b.sent.length,1);assert.equal(b.sent[0].body.referrer,'google.com');
});
