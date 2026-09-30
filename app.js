(() => {
  'use strict';
  const inventory = window.POKEMOTA_PRODUCTS || [];
  const byId = new Map(inventory.map(p => [p.id,p]));
  const money = value => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(value);
  const $ = selector => document.querySelector(selector);
  const productGrid = $('#product-grid');
  const search = $('#search-input');
  const sort = $('#sort-input');
  let category = 'all';
  let cart = loadCart();
  let lastFocus = null;

  function loadCart(){
    try {
      const stored = JSON.parse(localStorage.getItem('pokemota-demo-cart') || '{}');
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
      return Object.fromEntries(Object.entries(stored).filter(([id,qty]) => byId.has(id) && Number.isInteger(qty) && qty > 0).map(([id,qty]) => [id,Math.min(qty,byId.get(id).stock)]));
    } catch { return {}; }
  }
  function saveCart(){ try {localStorage.setItem('pokemota-demo-cart',JSON.stringify(cart));} catch {} }
  const escapeHTML = text => String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const productArt = p => `<div class="product-art ${escapeHTML(p.theme)}" role="img" aria-label="Decorative placeholder artwork for ${escapeHTML(p.name)}"><div class="art-orbit"></div><div class="art-card"><small>POKÉMOTA</small><span>${escapeHTML(p.art)}</span><small>THE COLLECTOR'S VAULT</small></div></div>`;
  function renderProducts(){
    const term = search.value.trim().toLocaleLowerCase();
    const visible = inventory.filter(p=>(category==='all'||p.category===category) && [p.name,p.set,p.number,p.rarity].some(v=>v.toLocaleLowerCase().includes(term)));
    switch(sort.value){ case 'price-low':visible.sort((a,b)=>a.price-b.price);break;case 'price-high':visible.sort((a,b)=>b.price-a.price);break;case 'name':visible.sort((a,b)=>a.name.localeCompare(b.name));break; }
    productGrid.innerHTML = visible.length ? visible.map(p=>`<article class="product-card">${productArt(p)}<div class="product-label">${escapeHTML(p.tag)}</div><div class="product-detail"><div class="product-set">${escapeHTML(p.set)} <span>· ${escapeHTML(p.number)}</span></div><h3>${escapeHTML(p.name)}</h3><div class="product-info">${escapeHTML(p.rarity)} · ${escapeHTML(p.condition)}</div><div class="product-bottom"><strong>${money(p.price)}</strong><button type="button" class="add-button" data-add="${escapeHTML(p.id)}" aria-label="Add ${escapeHTML(p.name)} to bag" ${p.stock<=0?'disabled':''}>${p.stock<=0?'SOLD OUT':'ADD +'} </button></div></div></article>`).join('') : '<p class="empty-products">NO MATCHES IN THE VAULT. TRY ANOTHER SEARCH.</p>';
    $('#results-note').textContent = `SHOWING ${visible.length} OF ${inventory.length} EXAMPLE PRODUCTS`;
  }
  function count(){return Object.values(cart).reduce((sum,qty)=>sum+qty,0);}
  function renderCart(){
    const entries=Object.entries(cart).filter(([id,qty])=>byId.has(id)&&qty>0);
    $('#cart-count').textContent=count(); $('#drawer-count').textContent=`(${count()})`;
    $('#cart-items').innerHTML=entries.length?entries.map(([id,qty])=>{const p=byId.get(id);return `<div class="cart-item"><div class="cart-art ${escapeHTML(p.theme)}">${escapeHTML(p.art)}</div><div class="cart-item-info"><small>${escapeHTML(p.set)}</small><h3>${escapeHTML(p.name)}</h3><strong>${money(p.price)}</strong><div class="qty-controls"><button data-change="${escapeHTML(id)}" data-delta="-1" aria-label="Remove one ${escapeHTML(p.name)}">−</button><span>${qty}</span><button data-change="${escapeHTML(id)}" data-delta="1" aria-label="Add one ${escapeHTML(p.name)}" ${qty>=p.stock?'disabled':''}>+</button></div></div><button class="remove-item" data-remove="${escapeHTML(id)}" aria-label="Remove ${escapeHTML(p.name)}">×</button></div>`;}).join(''):'<div class="empty-cart"><span>✦</span><h3>THE VAULT AWAITS.</h3><p>Your bag is empty. Find something worth chasing.</p><button id="keep-shopping" class="btn btn-outline">EXPLORE THE VAULT</button></div>';
    $('#cart-total').textContent=money(entries.reduce((sum,[id,qty])=>sum+byId.get(id).price*qty,0));
  }
  function updateCart(id,delta){const p=byId.get(id);if(!p)return;const qty=Math.max(0,Math.min(p.stock,(cart[id]||0)+delta));if(qty)cart[id]=qty;else delete cart[id];saveCart();renderCart();}
  function openCart(){lastFocus=document.activeElement;$('#cart-scrim').hidden=false;$('#cart-drawer').classList.add('open');$('#cart-drawer').setAttribute('aria-hidden','false');document.body.classList.add('no-scroll');$('#cart-close').focus();}
  function closeCart(){ $('#cart-drawer').classList.remove('open');$('#cart-drawer').setAttribute('aria-hidden','true');$('#cart-scrim').hidden=true;document.body.classList.remove('no-scroll');if(lastFocus&&lastFocus.isConnected)lastFocus.focus(); }
  document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>{category=button.dataset.category;document.querySelectorAll('.tab').forEach(tab=>{const isActive=tab===button;tab.classList.toggle('active',isActive);tab.setAttribute('aria-pressed',String(isActive));});renderProducts();}));
  search.addEventListener('input',renderProducts);sort.addEventListener('change',renderProducts);
  productGrid.addEventListener('click',event=>{const button=event.target.closest('[data-add]');if(!button)return;updateCart(button.dataset.add,1);openCart();});
  $('#cart-items').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.id==='keep-shopping'){closeCart();$('#shop').scrollIntoView({behavior:'smooth'});return;}if(button.dataset.remove){delete cart[button.dataset.remove];saveCart();renderCart();}else if(button.dataset.change){updateCart(button.dataset.change,Number(button.dataset.delta));}});
  $('#cart-toggle').addEventListener('click',openCart);$('#cart-close').addEventListener('click',closeCart);$('#cart-scrim').addEventListener('click',closeCart);
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && $('#cart-drawer').classList.contains('open'))closeCart();if(event.key==='Tab'&&$('#cart-drawer').classList.contains('open')){const controls=[...$('#cart-drawer').querySelectorAll('button:not([disabled])')];if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}}});
  $('#search-toggle').addEventListener('click',()=>{$('#shop').scrollIntoView({behavior:'smooth'});search.focus({preventScroll:true});});
  $('#year').textContent=new Date().getFullYear();
  renderProducts();renderCart();
})();