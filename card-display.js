(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeImage(value) { try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } }
  function art(p, detail=false) {
    const image=safeImage(p.imageUrl);
    return `<div class="product-art card-image-wrap${detail?' detail-art':''}">${image?`<img class="real-card-image" src="${esc(image)}" alt="${esc(p.name)} — ${esc(p.set)} ${esc(p.number)}" loading="lazy" referrerpolicy="no-referrer"><span class="image-unavailable" hidden>Image unavailable</span>`:'<span class="image-unavailable">No card image available</span>'}</div>`;
  }
  function badges(p) {
    const m=p.cardMetadata || {}, symbol=safeImage(m.setSymbolUrl);
    const labels=(m.types || []).length ? m.types : (m.cardCategory ? [m.cardCategory==='Pokemon'?'Pokémon':m.cardCategory] : []);
    return `<div class="card-badges">${symbol?`<img class="set-symbol" src="${esc(symbol)}" alt="${esc(p.set)} set symbol" loading="lazy" referrerpolicy="no-referrer">`:''}${p.stock<=0?'<span class="type-badge sold-out-badge">Sold out</span>':''}${labels.map(t=>`<span class="type-badge">${esc(t)}</span>`).join('')}</div>`;
  }
  document.addEventListener('error',event=>{const img=event.target;if(img instanceof HTMLImageElement && img.classList.contains('real-card-image')){img.hidden=true;const fallback=img.nextElementSibling;if(fallback)fallback.hidden=false;}else if(img instanceof HTMLImageElement && img.classList.contains('set-symbol'))img.hidden=true;},true);
  function price(p) { return p.stock<=0 && Number(p.price)===0 ? '' : new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(p.price); }
  window.PokemotaCard={art,badges,price};
  // Only offer inspection once an actual image has loaded successfully.
  document.addEventListener('load',event=>{
    const img=event.target;
    if(!(img instanceof HTMLImageElement)||!img.matches('.detail-art .real-card-image')||img.parentElement.querySelector('.image-zoom'))return;
    const button=document.createElement('button');button.type='button';button.className='image-zoom btn btn-outline';button.textContent='Inspect image';
    button.addEventListener('click',()=>{
      const dialog=document.createElement('dialog');dialog.className='image-dialog';
      const close=document.createElement('button');close.className='btn btn-outline';close.textContent='Close image';
      const copy=img.cloneNode();copy.removeAttribute('loading');
      dialog.append(close,copy);document.body.append(dialog);
      close.addEventListener('click',()=>dialog.close());
      dialog.addEventListener('close',()=>{dialog.remove();button.focus();});
      dialog.showModal();close.focus();
    });img.parentElement.append(button);
  },true);
})();
