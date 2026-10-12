(() => {
  'use strict';
  const inventory = window.POKEMOTA_PRODUCTS || [];
  const byId = new Map(inventory.map(p => [p.id,p]));
  const money = value => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(value);
  const $ = selector => document.querySelector(selector);
  let cart = loadCart();
  let lastFocus = null;

  function loadCart(){return window.PokemotaCart.read();}
  function saveCart(){window.PokemotaCart.write(cart);}
  const escapeHTML = text => String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function count(){return Object.values(cart).reduce((sum,qty)=>sum+qty,0);}
  function renderCart(){
    const entries=Object.entries(cart).filter(([id,qty])=>byId.has(id)&&qty>0);
    $('#cart-count').textContent=count(); $('#drawer-count').textContent=`(${count()})`;
    $('#cart-items').innerHTML=entries.length?entries.map(([id,qty])=>{const p=byId.get(id);return `<div class="cart-item"><div class="cart-art ${escapeHTML(p.theme)}">${p.imageUrl?`<img src="${escapeHTML(p.imageUrl)}" alt="${escapeHTML(p.name)}" referrerpolicy="no-referrer">`:escapeHTML(p.name)}</div><div class="cart-item-info"><small>${escapeHTML(p.set)}</small><h3>${escapeHTML(p.name)}</h3><strong>${window.PokemotaCard.price(p)}</strong><div class="qty-controls"><button data-change="${escapeHTML(id)}" data-delta="-1" aria-label="Remove one ${escapeHTML(p.name)}">−</button><span>${qty}</span><button data-change="${escapeHTML(id)}" data-delta="1" aria-label="Add one ${escapeHTML(p.name)}" ${qty>=p.stock?'disabled':''}>+</button></div></div><button class="remove-item" data-remove="${escapeHTML(id)}" aria-label="Remove ${escapeHTML(p.name)}">×</button></div>`;}).join(''):'<div class="empty-cart"><span>✦</span><h3>THE VAULT AWAITS.</h3><p>Your bag is empty. Find something worth chasing.</p><button id="keep-shopping" class="btn btn-outline">EXPLORE THE VAULT</button></div>';
    $('#checkout-link').hidden=!entries.length||!window.POKEMOTA_LIVE;$('#cart-payment-note').textContent=window.POKEMOTA_LIVE?'Pay by EFT. Delivery R80 or free collection in Brits.':'Static preview: checkout is unavailable.';$('#cart-total').textContent=money(entries.reduce((sum,[id,qty])=>sum+byId.get(id).price*qty,0));
  }
  function updateCart(id,delta){const p=byId.get(id);if(!p)return;const qty=Math.max(0,Math.min(p.stock,(cart[id]||0)+delta));if(qty)cart[id]=qty;else delete cart[id];saveCart();renderCart();}
  function openCart(){lastFocus=document.activeElement;$('#cart-scrim').hidden=false;$('#cart-drawer').classList.add('open');$('#cart-drawer').setAttribute('aria-hidden','false');document.body.classList.add('no-scroll');$('#cart-close').focus();}
  function closeCart(){ $('#cart-drawer').classList.remove('open');$('#cart-drawer').setAttribute('aria-hidden','true');$('#cart-scrim').hidden=true;document.body.classList.remove('no-scroll');if(lastFocus&&lastFocus.isConnected)lastFocus.focus(); }
  $('#cart-items').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.id==='keep-shopping'){closeCart();$('#shop').scrollIntoView({behavior:'smooth'});return;}if(button.dataset.remove){delete cart[button.dataset.remove];saveCart();renderCart();}else if(button.dataset.change){updateCart(button.dataset.change,Number(button.dataset.delta));}});
  $('#cart-toggle').addEventListener('click',openCart);$('#cart-close').addEventListener('click',closeCart);$('#cart-scrim').addEventListener('click',closeCart);
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && $('#cart-drawer').classList.contains('open'))closeCart();if(event.key==='Tab'&&$('#cart-drawer').classList.contains('open')){const controls=[...$('#cart-drawer').querySelectorAll('button:not([disabled]),a[href]')].filter(e=>e.getClientRects().length);if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}}});
  $('#year').textContent=new Date().getFullYear();
  renderCart();
})();
