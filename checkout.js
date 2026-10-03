(() => {
 'use strict';const $=s=>document.querySelector(s),form=$('#checkout-form'),money=n=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(n/100),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let products=[],quote=null,version=0,busy=false,pending=null,profile=null,currentReceipt=null,paymentEnvironment='sandbox';
 const storageKey='pokemota-pending-order';
 const message=s=>{$('#checkout-message').textContent=s;};
 const items=()=>Object.entries(window.PokemotaCart.read()).map(([id,quantity])=>({id,quantity}));
 async function api(url,options={}){const r=await fetch(url,{signal:AbortSignal.timeout(20000),...options,headers:{'Content-Type':'application/json',...options.headers}});let data;try{data=await r.json();}catch{data={error:'Unexpected server response.'};}if(!r.ok){const e=Error(data.error||'Request failed.');e.status=r.status;throw e;}return data;}
 function showPending(){ $('#pending-attempt').hidden=!pending;$('#checkout-content').hidden=!!pending||!profile;$('#checkout-signin').hidden=!!profile;$('#retry-order').disabled=!profile; }
 function renderBag(){
   const bag=items();$('#checkout-items').innerHTML=bag.length?bag.map(i=>{const p=products.find(p=>p.id===i.id);return `<article class="checkout-item"><h3>${esc(p?.name||'Unavailable product')}</h3><small>${esc(p?.set||'Remove this item if it is no longer listed.')}</small><div><label>Quantity<input type="number" min="1" max="99" value="${i.quantity}" data-quantity="${esc(i.id)}"></label><button type="button" data-remove="${esc(i.id)}">REMOVE</button></div></article>`;}).join(''):'<p>Your bag is empty. <a href="catalogue.html">Find a card in the catalogue.</a></p>';
 }
 async function refreshQuote(){
   const current=++version;quote=null;$('#place-order').disabled=true;$('#checkout-totals').textContent='';
   if(!items().length)return;
   try{const found=await api('/api/checkout/quote',{method:'POST',body:JSON.stringify({items:items(),fulfilment:form.elements.fulfilment.value})});if(current!==version)return;quote=found;$('#checkout-totals').innerHTML=[['Subtotal',found.subtotalCents],['Delivery / collection',found.deliveryCents],['Total',found.totalCents]].map(([label,n])=>`<div class="checkout-total-row"><span>${label}</span><strong>${money(n)}</strong></div>`).join('');$('#place-order').disabled=busy;message('');}catch(e){if(current===version)message(e.message);}
 }
 $('#checkout-items').addEventListener('change',e=>{if(busy)return;const id=e.target.dataset.quantity;if(!id)return;const n=Number(e.target.value);if(!Number.isInteger(n)||n<1||n>99){renderBag();return;}try{const cart=window.PokemotaCart.read();cart[id]=n;window.PokemotaCart.write(cart);refreshQuote();}catch(e){message(e.message);}});
 $('#checkout-items').addEventListener('click',e=>{if(busy)return;const id=e.target.closest('[data-remove]')?.dataset.remove;if(!id)return;try{const cart=window.PokemotaCart.read();delete cart[id];window.PokemotaCart.write(cart);renderBag();refreshQuote();}catch(e){message(e.message);}});
 $('#fulfilment').addEventListener('change',()=>{const delivery=form.elements.fulfilment.value==='delivery';$('#delivery-address').hidden=!delivery;$('#delivery-address').disabled=!delivery;refreshQuote();});
 function storePending(value){pending=value;try{if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);}catch{}showPending();}
 function showReceipt(receipt){
   currentReceipt=receipt;$('#checkout-content').hidden=true;$('#pending-attempt').hidden=true;$('#order-success').hidden=false;
   $('#receipt-reference').textContent='Reference: '+receipt.reference;
   $('#receipt-total').textContent='Total: '+money(receipt.totalCents)+' · '+receipt.status.replaceAll('_',' ');
   const online=receipt.paymentMethod!=='eft',unpaid=receipt.status==='pending_payment';
   $('#receipt-instructions').textContent=online?(unpaid?'Complete payment through your selected provider. Your order is saved and stock is reserved.':'Payment confirmed. We will arrange fulfilment using your saved contact details.'):(receipt.eftInstructions+'\nPayment reference: '+receipt.reference);
   $('#receipt-followup').textContent=online?'A return from the payment page does not confirm payment. Check payment status below.':'Use your order reference when paying. We will confirm payment once funds arrive.';
   $('#pay-order').hidden=!online||!unpaid;$('#check-payment').hidden=!online;
   message(online?(unpaid?'Order saved; awaiting payment confirmation.':'Payment confirmed.'):'Order saved. Pay by EFT using the banking details below.');
   $('#order-success').focus();
 }
 async function payOrder(){
   if(busy||!currentReceipt)return;busy=true;$('#pay-order').disabled=true;
   try{
     const checkout=await api('/api/orders/'+encodeURIComponent(currentReceipt.reference)+'/payment',{method:'POST',body:'{}'});
     if(checkout.fields){const paymentForm=document.createElement('form');paymentForm.method='POST';paymentForm.action=checkout.url;for(const [name,value] of Object.entries(checkout.fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;paymentForm.append(input);}document.body.append(paymentForm);paymentForm.submit();}
     else location.assign(checkout.url);
   }catch(e){message(e.message);}finally{busy=false;$('#pay-order').disabled=false;}
 }
 $('#pay-order').addEventListener('click',payOrder);
 $('#check-payment').addEventListener('click',async()=>{try{showReceipt(await api('/api/orders/'+encodeURIComponent(currentReceipt.reference)));}catch(e){message(e.message);}});
 $('#payment-method').addEventListener('change',()=>{const online=form.elements.paymentMethod.value!=='eft';$('#place-order').textContent=online?'PLACE ORDER — CONTINUE TO PAYMENT':'PLACE ORDER — PAY BY EFT';$('#eft-note').textContent=online?(paymentEnvironment==='sandbox'?'Paystack test mode: use only provider test details. No real card payment is collected.':'Your order will be saved before you continue to secure hosted payment.'):'Banking details appear after your order is saved.';});
 async function sendOrder(){
   if(busy||!profile||!pending)return;busy=true;$('#retry-order').disabled=true;$('#place-order').disabled=true;message('Saving your order…');
   try{
     const receipt=await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':pending.key},body:JSON.stringify(pending.body)});
     const cart=window.PokemotaCart.read();for(const i of pending.body.items){const left=(cart[i.id]||0)-i.quantity;if(left>0)cart[i.id]=left;else delete cart[i.id];}try{window.PokemotaCart.write(cart);}catch{}
     storePending(null);history.replaceState(null,'','checkout.html?order='+encodeURIComponent(receipt.reference));showReceipt(receipt);
   }catch(e){
     if(e.status===401){profile=null;showPending();message('Your session expired. Sign in to safely retry your order.');}
     else if([400,403,409].includes(e.status)){storePending(null);await refreshQuote();message(e.message+' Please review your order before retrying.');}
     else{showPending();message('Your order has not been confirmed here. Use Check / retry order to safely check the same attempt.');}
   }finally{busy=false;$('#retry-order').disabled=!profile;if(quote&&!pending)$('#place-order').disabled=false;}
 }
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy||!profile||!quote||!form.reportValidity())return;const f=new FormData(form),customer={};for(const key of ['address','city','province','postalCode'])customer[key]=String(f.get(key)||'');storePending({key:crypto.randomUUID(),body:{items:items(),fulfilment:f.get('fulfilment'),paymentMethod:f.get('paymentMethod'),customer,expectedTotalCents:quote.totalCents}});await sendOrder();});
 $('#retry-order').addEventListener('click',sendOrder);
 (async()=>{try{const stored=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(stored?.key&&stored?.body)pending=stored;}catch{}showPending();try{try{const account=await api('/api/account/profile');profile=account.profile;$('#checkout-profile').textContent=profile.name+' ? '+profile.email+' ? '+profile.phone;}catch(e){if(e.status!==401)throw e;}showPending();const config=await api('/api/checkout/config');paymentEnvironment=config.paymentEnvironment||'sandbox';$('#payment-method').replaceChildren(...config.paymentMethods.map(method=>{const option=document.createElement('option');option.value=method.id;option.textContent=method.label+(method.id!=='eft'&&config.paymentEnvironment==='sandbox'?' (TEST MODE)':'');return option;}));const reference=new URLSearchParams(location.search).get('order');if(reference){if(!profile){$('#checkout-signin a').href='account.html?next=checkout&order='+encodeURIComponent(reference);message('Sign in to view your saved order.');return;}showReceipt(await api('/api/orders/'+encodeURIComponent(reference)));return;}$('#eft-note').textContent='Banking details will appear after your order is saved. Use your order reference when paying by EFT.';products=await api('/api/products');renderBag();if(!pending)await refreshQuote();}catch{message('Checkout is unavailable. Check that the website server is running and try again.');}})();
})();
