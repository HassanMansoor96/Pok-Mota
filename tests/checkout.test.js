'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../checkout.js'),'utf8');
async function load({signedIn=true,status='pending_payment',paymentMethod='stripe'}={}){
 const nodes=new Map(),calls=[];
 function node(selector){if(!nodes.has(selector))nodes.set(selector,{hidden:true,disabled:false,textContent:'',listeners:{},addEventListener(event,fn){this.listeners[event]=fn;},replaceChildren(...children){this.children=children;},focus(){}});return nodes.get(selector);}
 node('#checkout-form').elements={fulfilment:{value:'collection'},paymentMethod:{value:paymentMethod}};
 const reference='PM-0123456789ABCDEF0123';
 const context={document:{querySelector:node,createElement:()=>({})},Intl,URLSearchParams,AbortSignal,location:{search:'?order='+reference},sessionStorage:{getItem:()=>null},window:{PokemotaCart:{read:()=>({})}},fetch:async url=>{
  calls.push(url);
  if(url==='/api/account/profile')return {ok:signedIn,status:signedIn?200:401,json:async()=>signedIn?{profile:{name:'Buyer',email:'buyer@example.com',phone:'0123456789'}}:{error:'Sign in'}};
  if(url==='/api/checkout/config')return {ok:true,json:async()=>({paymentMethods:[{id:'eft',label:'EFT'},{id:'stripe',label:'Stripe'}]})};
  if(url.startsWith('/api/orders/'))return {ok:true,json:async()=>({reference,status,paymentMethod,totalCents:10000,eftInstructions:'Test bank instructions'})};
  throw Error('Unexpected API call: '+url);
 }};
 vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));return {node,calls,reference};
}
test('payment return shows persisted unpaid order and does not claim payment success',async()=>{
 const {node,calls}=await load();assert.equal(node('#order-success').hidden,false);assert.equal(node('#pay-order').hidden,false);
 assert.match(node('#checkout-message').textContent,/awaiting payment/);assert.equal(node('#checkout-content').hidden,true);
 assert.ok(!calls.includes('/api/checkout/quote'));assert.ok(!calls.includes('/api/products'));
});
test('verified paid receipt hides payment retry and EFT receipts show banking instructions',async()=>{
 const paid=await load({status:'paid'});assert.equal(paid.node('#pay-order').hidden,true);assert.equal(paid.node('#checkout-message').textContent,'Payment confirmed.');
 const eft=await load({paymentMethod:'eft'});assert.equal(eft.node('#pay-order').hidden,true);assert.equal(eft.node('#check-payment').hidden,true);assert.match(eft.node('#receipt-instructions').textContent,/Test bank instructions/);
});
test('signed-out return preserves order reference through the sign-in link',async()=>{
 const {node,reference}=await load({signedIn:false});assert.equal(node('#checkout-signin').hidden,false);
 assert.equal(node('#checkout-signin a').href,'account.html?next=checkout&order='+reference);assert.equal(node('#order-success').hidden,true);
});
