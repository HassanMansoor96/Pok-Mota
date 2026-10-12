(()=>{
  'use strict';
  const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={'/':'Sites homepage','/pokemota':'Store homepage','/catalogue.html':'Catalogue','/product.html':'Product details','/collections.html':'Collections','/about.html':'Our story','/faq.html':'Help & FAQ','/shipping.html':'Shipping','/contact.html':'Contact','/privacy.html':'Privacy','/checkout.html':'Checkout','/account.html':'Account'};
  let generation=0;
  function table(rows,first,second){return rows.length?'<table><thead><tr><th>'+first+'</th><th>'+second+'</th></tr></thead><tbody>'+rows.map(([label,value])=>'<tr><td>'+esc(label)+'</td><td>'+esc(value)+'</td></tr>').join('')+'</tbody></table>':'<p>No traffic recorded for this period yet.</p>';}
  async function load(){
    const version=++generation;$('#traffic-status').textContent='Loading website traffic…';
    try{
      const response=await fetch('/api/admin/traffic?days='+$('#analytics-days').value,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error(response.status===401?'Sign in again to view traffic.':'Traffic could not be loaded. Try refreshing.');
      const data=await response.json();if(version!==generation)return;const s=data.summary;
      $('#traffic-metrics').innerHTML=[['Page views',s.pageViews],['Estimated visits',s.visits],['Pages per visit',s.visits?(s.pageViews/s.visits).toFixed(1):'0'],['Views in last 30 minutes',s.recentPageViews]].map(([label,value])=>'<article class="analytics-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>').join('');
      const max=Math.max(1,...data.daily.map(d=>d.pageViews));
      $('#traffic-daily').innerHTML=data.daily.length?data.daily.map(d=>'<div class="analytics-day"><span>'+esc(d.date)+'</span><meter min="0" max="'+max+'" value="'+d.pageViews+'" aria-label="'+esc(d.date+' page views')+'"></meter><strong>'+esc(d.pageViews)+' views</strong></div>').join(''):'<p>Traffic will appear as visitors browse your site.</p>';
      $('#traffic-pages').innerHTML=table(data.pages.map(p=>[labels[p.path]||p.path,p.pageViews]),'Page','Views');
      $('#traffic-referrers').innerHTML=table(data.referrers.map(r=>[r.referrer||'Direct / unknown',r.visits]),'Source','Visits');
      $('#traffic-devices').innerHTML=table(data.devices.map(d=>[d.device.charAt(0).toUpperCase()+d.device.slice(1),d.pageViews]),'Device','Views');
      $('#traffic-status').textContent='Updated '+new Date(data.generatedAt).toLocaleTimeString('en-ZA')+'.';
    }catch(e){if(version===generation){$('#traffic-status').textContent=e.message;for(const id of ['metrics','daily','pages','referrers','devices'])$('#traffic-'+id).replaceChildren();}}
  }
  $('#analytics-days').addEventListener('change',load);$('#analytics-refresh').addEventListener('click',load);document.addEventListener('admin-analytics-open',load);
})();
