(() => {
  'use strict';
  const $ = s => document.querySelector(s), form = $('#product-form');
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(n);
  let marketPrices=[], csrf='', editing=null, editingVersion=null, products=[], metadata={}, searchVersion=0, page=1, searchCriteria=null;
  const field = name => form.elements.namedItem(name);
  const textFields=['name','set','number','category','rarity','condition','price','stock','tag','description','imageUrl'];
  const message = s => { $('#message').textContent=s; };
  const lookupMessage = s => { $('#lookup-status').textContent=s; };
  async function api(url,opts={}) {
    const res=await fetch(url,{credentials:'same-origin',...opts,headers:{...(opts.body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...opts.headers}});
    let data;try{data=await res.json();}catch{data={error:'Unexpected response'};}
    if(res.status===401 && csrf && !url.endsWith('/login')){csrf='';$('#login-view').hidden=false;$('#admin-view').hidden=true;$('#logout').hidden=true;message('Your session ended. Sign in again to continue; your product form is preserved.');}if(!res.ok)throw Error(data.error||'Request failed');return data;
  }
  function preview() {
    const url=field('imageUrl').value;
    let valid=false;try{valid=new URL(url).protocol==='https:';}catch{}
    const image=$('#selected-card-image');image.hidden=!valid;if(valid)image.src=url;else image.removeAttribute('src');
    $('#selected-card-info').textContent=metadata.id ? `${metadata.provider==='tcgcsv'?'TCGplayer':'TCGdex'} · ${metadata.id}${metadata.illustrator?' · Illustrated by '+metadata.illustrator:''}` : field('category').value==='sealed' ? 'Sealed product preview. Details and image remain editable.' : 'Choose a card to fill its details, or enter them manually.';
    const symbol=$('#selected-set-symbol');symbol.hidden=!metadata.setSymbolUrl;if(metadata.setSymbolUrl)symbol.src=metadata.setSymbolUrl;else symbol.removeAttribute('src');
  }
  function setMetadata(m={}) {
    metadata={...m};
    field('cardCategory').value=m.cardCategory||'';
    field('types').value=m.types?.[0]||'';field('secondaryType').value=m.types?.[1]||'';
    updateProductFields();
    preview();
  }
  function updateProductFields() {
    const sealed=field('category').value==='sealed';
    for(const name of ['number','rarity','condition','cardCategory','types','secondaryType']) {
      field(name).closest('label').hidden=sealed;
    }
    if(sealed) {
      for(const name of ['number','rarity','cardCategory','types','secondaryType'])field(name).value='';
      field('condition').value='Factory sealed';
    }
  }
  function clearSearch() {
    searchVersion++;clearSealedSearch();page=1;searchCriteria=null;$('#lookup-results').replaceChildren();$('#lookup-more').hidden=true;$('#lookup-search').disabled=false;$('#lookup-more').disabled=false;$('#save-product').disabled=false;lookupMessage('');
  }
  function resetEditor() {
    marketPrices=[];renderMarketPrices(false);
    clearSearch();editing=null;form.reset();setMetadata();$('#form-title').textContent='CREATE PRODUCT';
  }
  async function load() {
    try {products=await api('/api/admin/products');$('#product-rows').innerHTML=products.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.set)}</td><td>${money(p.price)}</td><td>${p.stock}</td><td>${p.isPublished?'PUBLISHED':'DRAFT'}</td><td><button type="button" data-edit="${esc(p.id)}">EDIT</button></td></tr>`).join('')||'<tr><td colspan="6">No products yet. Create your first product.</td></tr>';}
    catch(e){message(e.message);}
  }
  async function loadSets() {
    try { const sets=await api('/api/admin/card-catalogue/sets');$('#lookup-set').replaceChildren(new Option('All sets',''));sets.forEach(s=>$('#lookup-set').add(new Option(s.name,s.id))); }
    catch { lookupMessage('Set list unavailable. You can still search by card name or enter details manually.'); }
  }
  function showAdmin() {document.dispatchEvent(new Event('admin-signed-in'));$('#login-view').hidden=true;$('#admin-view').hidden=false;$('#logout').hidden=false;load();loadSets();loadSealedSets();}
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{const r=await api('/api/admin/login',{method:'POST',body:JSON.stringify({username:f.get('username'),password:f.get('password'),code:f.get('code')})});csrf=r.csrfToken;e.target.reset();showAdmin();message('Signed in.');}catch(err){message(err.message);}});
  $('#logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST'});location.reload();}catch(e){message(e.message);}});
  $('#new-product').addEventListener('click',()=>{resetEditor();$('#form-panel').hidden=false;$('#form-panel').scrollIntoView({behavior:'smooth'});$('#lookup-name').focus();});
  $('#cancel-edit').addEventListener('click',()=>{clearSearch();$('#form-panel').hidden=true;editing=null;});
  $('#product-rows').addEventListener('click',e=>{const id=e.target.closest('[data-edit]')?.dataset.edit,p=products.find(x=>x.id===id);if(!p)return;resetEditor();editing=id;editingVersion=p.version;if(p.tag && ![...field('tag').options].some(o=>o.value===p.tag))field('tag').add(new Option(p.tag,p.tag));for(const name of textFields)field(name).value=p[name]??'';field('isPublished').checked=p.isPublished;setMetadata(p.cardMetadata);$('#form-title').textContent='UPDATE PRODUCT';$('#form-panel').hidden=false;$('#form-panel').scrollIntoView({behavior:'smooth'});});
  $('#card-search-form').addEventListener('submit',e=>{e.preventDefault();clearSealedSearch();searchCriteria={name:$('#lookup-name').value.trim(),set:$('#lookup-set').value};search(1);});
  $('#lookup-more').addEventListener('click',()=>search(page+1));
  async function search(nextPage) {
    if(!searchCriteria)return;
    const generation=++searchVersion;
    $('#save-product').disabled=false;
    $('#lookup-search').disabled=true;$('#lookup-more').disabled=true;lookupMessage('Searching cards…');
    if(nextPage===1){$('#lookup-results').replaceChildren();$('#lookup-more').hidden=true;}
    try {
      const data=await api('/api/admin/card-catalogue/cards?'+new URLSearchParams({...searchCriteria,page:String(nextPage)}));
      if(generation!==searchVersion)return;
      const html=data.cards.map(c=>`<button type="button" class="lookup-card" data-card="${esc(c.id)}">${c.imageUrl?`<img src="${esc(c.imageUrl)}" loading="lazy" alt="${esc(c.name)}" referrerpolicy="no-referrer">`:'<span class="lookup-no-image">No image</span>'}<strong>${esc(c.name)}</strong><span>${esc(c.id)} · #${esc(c.number)}</span></button>`).join('');
      $('#lookup-results').insertAdjacentHTML('beforeend',html);page=data.page;$('#lookup-more').hidden=!data.hasMore;
      lookupMessage(data.cards.length?'Select the exact printing to fill the product details.':nextPage===1?'No cards found. Try another name or set.':'No more results.');
    } catch(e){if(generation===searchVersion)lookupMessage(e.message);}
    finally{if(generation===searchVersion){$('#lookup-search').disabled=false;$('#lookup-more').disabled=false;}}
  }
  $('#lookup-results').addEventListener('click',async e=>{
    const button=e.target.closest('[data-card]');if(!button)return;clearSealedSearch();
    const generation=++searchVersion;lookupMessage('Loading card details…');$('#save-product').disabled=true;
    try {
      const card=await api('/api/admin/card-catalogue/cards/'+encodeURIComponent(button.dataset.card));
      if(generation!==searchVersion)return;
      for(const key of ['name','set','number','rarity','imageUrl','description'])field(key).value=card[key]||'';
      field('category').value='single';setMetadata(card.cardMetadata);field('price').value='';marketPrices=card.marketPrices||[];renderMarketPrices(true);
      lookupMessage(card.imageUrl?'Card details loaded. Add your condition, selling price, and stock.':'Card details loaded. This printing has no image available from TCGdex.');
      field('condition').focus();
    } catch(e){if(generation===searchVersion)lookupMessage(e.message);}
    finally{if(generation===searchVersion){$('#save-product').disabled=false;$('#lookup-search').disabled=false;$('#lookup-more').disabled=false;}}
  });
  $('#clear-card-link').addEventListener('click',()=>{clearSearch();setMetadata();marketPrices=[];renderMarketPrices(false);lookupMessage('Card link removed. Current product fields remain editable.');});
  field('imageUrl').addEventListener('input',preview);
  field('category').addEventListener('change',()=>{setMetadata();marketPrices=[];renderMarketPrices(false);});
  for(const id of ['selected-card-image','selected-set-symbol'])$('#'+id).addEventListener('error',e=>{e.target.hidden=true;});
  form.addEventListener('submit',async e=>{
    e.preventDefault();updateProductFields();const f=new FormData(form),str=k=>String(f.get(k)||'').trim();
    const payload=Object.fromEntries(textFields.map(k=>[k,str(k)]));
    Object.assign(payload,{price:Number(f.get('price')),stock:Number(f.get('stock')),isPublished:field('isPublished').checked,cardMetadata:{...metadata,cardCategory:str('cardCategory'),types:[...new Set([field('types').value,field('secondaryType').value].filter(Boolean))]}});
    const button=$('#save-product');button.disabled=true;
    try{await api(editing?'/api/admin/products/'+encodeURIComponent(editing):'/api/admin/products',{method:editing?'PUT':'POST',body:JSON.stringify({...payload,...(editing?{version:editingVersion}:{})})});message(editing?'Product updated.':'Product created.');clearSearch();editing=null;$('#form-panel').hidden=true;await load();}catch(err){message(err.message);}finally{button.disabled=false;}
  });

  function renderMarketPrices(apply) {
    const select=$('#price-variant');select.replaceChildren(new Option('Choose a market price / variant',''));
    marketPrices.forEach((p,i)=>{const value=p.zarCents==null?'ZAR conversion unavailable':money(p.zarCents/100);select.add(new Option(p.source+' · '+p.variant+' · '+value+(p.stale?' · old/undated price':''),String(i)));});
    $('#market-price-note').textContent=marketPrices.length?'Choose the appropriate variant. Your selling price remains editable.':'No usable market price available. Enter your selling price manually.';
    const first=marketPrices.findIndex(p=>!p.stale&&p.zarCents!=null);if(apply&&first>=0){select.value=String(first);applyMarketPrice();}
  }
  function applyMarketPrice(){
    const index=$('#price-variant').value;if(index==='')return;const p=marketPrices[Number(index)];if(!p)return;
    const updated=p.updated?new Date(p.updated).toLocaleDateString():'unknown';
    $('#market-price-note').textContent=p.source+' '+p.kind+' ('+p.variant+'): '+p.amount+' '+p.currency+'. Price updated '+updated+'. '+(p.rateDate?'Exchange rate date '+p.rateDate+'. ':'')+(p.stale?'Price is old or undated; enter your selling price manually.':p.zarCents==null?'Conversion unavailable; enter your selling price manually.':'Converted estimate; your selling price remains editable.');
    if(!p.stale&&p.zarCents!=null){field('price').value=(p.zarCents/100).toFixed(2);metadata.marketVariant=p.variant;metadata.marketSource=p.source;}
  }
  $('#price-variant').addEventListener('change',applyMarketPrice);
  $('#refresh-price').addEventListener('click',async()=>{
    if(!metadata.id){$('#market-price-note').textContent='Select a card or sealed product from search first.';return;}
    const id=metadata.id,provider=metadata.provider,setId=metadata.setId,button=$('#refresh-price');button.disabled=true;
    const url=provider==='tcgcsv'?'/api/admin/sealed-catalogue/sets/'+encodeURIComponent(setId)+'/products/'+encodeURIComponent(id):'/api/admin/card-catalogue/cards/'+encodeURIComponent(id);
    try{const card=await api(url);if(metadata.id!==id||metadata.provider!==provider||metadata.setId!==setId)return;marketPrices=card.marketPrices||[];renderMarketPrices(false);$('#market-price-note').textContent+=' Select a price to replace your current selling price.';}catch(e){$('#market-price-note').textContent=e.message;}finally{button.disabled=false;}
  });


  let sealedVersion=0, sealedPage=1, sealedCriteria=null;
  function clearSealedSearch() {
    sealedVersion++;sealedCriteria=null;sealedPage=1;
    $('#sealed-results').replaceChildren();$('#sealed-more').hidden=true;
    $('#sealed-search').disabled=false;$('#sealed-more').disabled=false;$('#sealed-status').textContent='';
  }
  async function loadSealedSets() {
    try {const sets=await api('/api/admin/sealed-catalogue/sets');$('#sealed-set').replaceChildren(new Option('Choose a set',''));sets.forEach(s=>$('#sealed-set').add(new Option(s.name,s.id)));}
    catch(e){$('#sealed-status').textContent=e.message;}
  }
  $('#sealed-search-form').addEventListener('submit',e=>{e.preventDefault();clearSearch();sealedCriteria={set:$('#sealed-set').value,name:$('#sealed-name').value.trim()};searchSealed(1);});
  $('#sealed-more').addEventListener('click',()=>searchSealed(sealedPage+1));
  async function searchSealed(nextPage) {
    if(!sealedCriteria)return;
    const version=++sealedVersion;
    $('#sealed-search').disabled=true;$('#sealed-more').disabled=true;$('#sealed-status').textContent='Searching sealed products?';
    if(nextPage===1){$('#sealed-results').replaceChildren();$('#sealed-more').hidden=true;}
    try {
      const data=await api('/api/admin/sealed-catalogue/products?'+new URLSearchParams({...sealedCriteria,page:String(nextPage)}));
      if(version!==sealedVersion)return;
      $('#sealed-results').insertAdjacentHTML('beforeend',data.products.map(p=>`<button type="button" class="lookup-card" data-sealed="${esc(p.id)}" data-set="${esc(sealedCriteria.set)}">${p.imageUrl?`<img src="${esc(p.imageUrl)}" loading="lazy" alt="${esc(p.name)}" referrerpolicy="no-referrer">`:'<span class="lookup-no-image">No image</span>'}<strong>${esc(p.name)}</strong><span>${esc(p.set)}</span></button>`).join(''));
      sealedPage=data.page;$('#sealed-more').hidden=!data.hasMore;
      $('#sealed-status').textContent=data.products.length?'Select a sealed product to fill its details and image.':'No sealed products found. Try another set or enter details manually.';
    }catch(e){if(version===sealedVersion)$('#sealed-status').textContent=e.message;}
    finally{if(version===sealedVersion){$('#sealed-search').disabled=false;$('#sealed-more').disabled=false;}}
  }
  $('#sealed-results').addEventListener('click',async e=>{
    const button=e.target.closest('[data-sealed]');if(!button)return;
    searchVersion++;const version=++sealedVersion;$('#save-product').disabled=true;$('#sealed-status').textContent='Loading sealed product?';
    try {
      const product=await api('/api/admin/sealed-catalogue/sets/'+encodeURIComponent(button.dataset.set)+'/products/'+encodeURIComponent(button.dataset.sealed));
      if(version!==sealedVersion)return;
      for(const key of ['name','set','number','rarity','imageUrl','description','category','condition','tag'])field(key).value=product[key]||'';
      setMetadata(product.cardMetadata);field('price').value='';marketPrices=product.marketPrices||[];renderMarketPrices(true);
      $('#sealed-status').textContent=product.imageUrl?'Product loaded. Add your selling price and stock.':'Product loaded without an image. Add an image URL, selling price and stock.';
      field('price').focus();
    }catch(e){if(version===sealedVersion)$('#sealed-status').textContent=e.message;}
    finally{if(version===sealedVersion){$('#save-product').disabled=false;$('#lookup-search').disabled=false;$('#lookup-more').disabled=false;}}
  });

  api('/api/admin/session').then(r=>{csrf=r.csrfToken;showAdmin();}).catch(()=>{});
})();
