(()=>{
  'use strict';
  const $=s=>document.querySelector(s), menu=$('#admin-nav'), toggle=$('#admin-menu');
  let current='analytics';
  function closeMenu(){menu.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');}
  function show(screen,focus=false){
    if(!['analytics','inventory','orders','editor'].includes(screen))screen='analytics';
    current=screen;
    document.querySelectorAll('[data-admin-screen]').forEach(el=>{el.hidden=el.dataset.adminScreen!==screen;});
    document.querySelectorAll('[data-admin-link]').forEach(el=>{if(el.dataset.adminLink===screen)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    closeMenu();
    if(screen==='analytics')document.dispatchEvent(new Event('admin-analytics-open'));
    if(focus){const heading=document.querySelector('[data-admin-screen="'+screen+'"] h2');if(heading){heading.tabIndex=-1;heading.focus();}window.scrollTo({top:0,behavior:'smooth'});}
  }
  toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';menu.style.top=toggle.closest('header').getBoundingClientRect().bottom+'px';toggle.setAttribute('aria-expanded',String(open));menu.classList.toggle('is-open',open);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();toggle.focus();}});
  menu.addEventListener('click',e=>{const link=e.target.closest('[data-admin-link]');if(!link)return;show(link.dataset.adminLink,true);});
  document.addEventListener('admin-signed-in',()=>{toggle.hidden=false;menu.hidden=false;show(current);});
  document.addEventListener('admin-signed-out',()=>{toggle.hidden=true;menu.hidden=true;closeMenu();});
  document.addEventListener('admin-editor-open',()=>show('editor'));
  document.addEventListener('admin-editor-close',()=>show('inventory',true));
  document.addEventListener('admin-inventory-updated',()=>{if(current==='analytics')document.dispatchEvent(new Event('admin-analytics-open'));});
})();
