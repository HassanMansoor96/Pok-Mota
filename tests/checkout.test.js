'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../checkout.js'),'utf8');
async function load({signedIn=true,status='pending_payment',paymentMethod='stripe',checkoutOpen=true,pendingAttempt=null,orderError=null,configError=null}={}){
 const nodes=new Map(),calls=[];
 function node(selector){if(!nodes.has(selector))nodes.set(selector,{hidden:true,disabled:false,textContent:'',listeners:{},addEventListener(event,fn){this.listeners[event]=fn;},replaceChildren(...children){this.children=children;},focus(){}});return nodes.get(selector);}
 node('#checkout-form').elements={fulfilment:{value:'collection'},paymentMethod:{value:paymentMethod}};
 const reference='PM-0123456789ABCDEF0123';
 const stored=new Map(pendingAttempt?[['pokemota-pending-order',JSON.stringify(pendingAttempt)]]:[]);
 const context={document:{querySelector:node,createElement:()=>({})},Intl,URLSearchParams,AbortSignal,location:{search:pendingAttempt?'':'?order='+reference},sessionStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)},window:{PokemotaCart:{read:()=>({})}},fetch:async url=>{
  calls.push(url);
  if(url==='/api/account/profile')return {ok:signedIn,status:signedIn?200:401,json:async()=>signedIn?{profile:{name:'Buyer',email:'buyer@example.com',phone:'0123456789'}}:{error:'Sign in'}};
  if(url==='/api/checkout/config')return configError?{ok:false,status:503,json:async()=>({error:configError})}:{ok:true,json:async()=>({checkoutOpen,paymentMethods:[{id:'eft',label:'EFT'},{id:'stripe',label:'Stripe'}]})};
  if(url==='/api/products')return {ok:true,json:async()=>[]};
  if(url==='/api/orders'&&orderError)return {ok:false,status:orderError.status,json:async()=>({error:orderError.message,code:orderError.code})};
  if(url.startsWith('/api/orders/'))return {ok:true,json:async()=>({reference,status,paymentMethod,totalCents:10000,eftInstructions:'Test bank instructions'})};
  throw Error('Unexpected API call: '+url);
 }};
 vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));return {node,calls,reference,stored};
}
test('payment return shows persisted unpaid order and does not claim payment success',async()=>{
 const {node,calls}=await load();assert.equal(node('#order-success').hidden,false);assert.equal(node('#pay-order').hidden,false);
 assert.match(node('#checkout-message').textContent,/awaiting payment/);assert.equal(node('#checkout-content').hidden,true);
 assert.ok(!calls.includes('/api/checkout/quote'));assert.ok(!calls.includes('/api/products'));
});

const pendingAttempt={key:'11111111-1111-4111-8111-111111111111',body:{items:[{id:'22222222-2222-4222-8222-222222222222',quantity:1}]}};
test('closed checkout disables retry without losing an uncertain previous order attempt',async()=>{
 const {node,calls,stored}=await load({checkoutOpen:false,pendingAttempt});
 assert.equal(node('#retry-order').disabled,true);
 assert.equal(node('#place-order').disabled,true);
 assert.match(node('#checkout-message').textContent,/not open yet/);
 await node('#retry-order').listeners.click();
 assert.ok(!calls.includes('/api/orders'));
 assert.equal(stored.get('pokemota-pending-order'),JSON.stringify(pendingAttempt));
});
test('closure between config and order submission explains the rejection and stops retrying',async()=>{
 const {node,stored}=await load({pendingAttempt,orderError:{status:503,code:'CHECKOUT_CLOSED',message:'Checkout is not open yet. Please contact support.'}});
 await node('#retry-order').listeners.click();
 assert.match(node('#checkout-message').textContent,/Checkout is not open yet/);
 assert.equal(node('#retry-order').disabled,true);
 assert.equal(stored.get('pokemota-pending-order'),JSON.stringify(pendingAttempt));
});
test('server failures retain the same retry attempt and reveal the useful server error',async()=>{
 const {node,stored}=await load({pendingAttempt,orderError:{status:500,message:'Unable to process this request. Please try again.'}});
 await node('#retry-order').listeners.click();
 assert.match(node('#checkout-message').textContent,/Unable to process this request/);
 assert.equal(node('#retry-order').disabled,false);
 assert.equal(stored.get('pokemota-pending-order'),JSON.stringify(pendingAttempt));
});
test('startup exposes a configuration error instead of replacing it with a generic retry',async()=>{
 const {node}=await load({configError:'Checkout temporarily unavailable.'});
 assert.equal(node('#checkout-message').textContent,'Checkout temporarily unavailable.');
});
test('verified paid receipt hides payment retry and EFT receipts show banking instructions',async()=>{
 const paid=await load({status:'paid'});assert.equal(paid.node('#pay-order').hidden,true);assert.equal(paid.node('#checkout-message').textContent,'Payment confirmed.');
 const eft=await load({paymentMethod:'eft'});assert.equal(eft.node('#pay-order').hidden,true);assert.equal(eft.node('#check-payment').hidden,true);assert.match(eft.node('#receipt-instructions').textContent,/Test bank instructions/);
});
test('signed-out return preserves order reference through the sign-in link',async()=>{
 const {node,reference}=await load({signedIn:false});assert.equal(node('#checkout-signin').hidden,false);
 assert.equal(node('#checkout-signin a').href,'account.html?next=checkout&order='+reference);assert.equal(node('#order-success').hidden,true);
});
