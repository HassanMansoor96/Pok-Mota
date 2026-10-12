(()=>{
  'use strict';
  if(!/^https?:$/.test(location.protocol)||navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
  const allowed=['/','/index.html','/pokemota','/pokemota/','/pokemota.html','/catalogue.html','/product.html','/collections.html','/about.html','/faq.html','/shipping.html','/contact.html','/privacy.html','/checkout.html','/account.html'];
  const raw=location.pathname;if(!allowed.includes(raw))return;
  const path=raw==='/index.html'?'/':raw.startsWith('/pokemota')?'/pokemota':raw;
  let sent=false;
  function track(){
    if(sent||document.visibilityState==='hidden')return;
    sent=true;
    try{
      const now=Date.now(),key='hm-traffic-visit';let visit;
      try{visit=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
      if(!visit||typeof visit.id!=='string'||!/^[0-9a-f-]{36}$/i.test(visit.id)||!Number.isFinite(visit.lastSeen)||visit.lastSeen>now||now-visit.lastSeen>30*60*1000){
        let referrer='';try{const source=new URL(document.referrer);if(source.hostname!==location.hostname&&/^https?:$/.test(source.protocol))referrer=source.hostname;}catch{}
        visit={id:crypto.randomUUID(),referrer,lastSeen:now};
      }
      visit.lastSeen=now;try{sessionStorage.setItem(key,JSON.stringify(visit));}catch{}
      const body=JSON.stringify({id:crypto.randomUUID(),session:visit.id,path,referrer:visit.referrer||''});
      fetch('/api/traffic',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
    }catch{/* Browser storage, crypto or analytics failure must not interrupt shopping. */}
  }
  track();document.addEventListener('visibilitychange',track);
  window.addEventListener('pageshow',e=>{if(e.persisted){sent=false;track();}});
})();
