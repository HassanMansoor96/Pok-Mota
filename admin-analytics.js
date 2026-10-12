(()=>{
  'use strict';
  const $=s=>document.querySelector(s),money=n=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(n/100);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let generation=0;
  async function load(){
    const version=++generation;$('#analytics-status').textContent='Loading store analytics…';$('#analytics-refresh').disabled=true;
    try{
      const response=await fetch('/api/admin/analytics?days='+$('#analytics-days').value,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error(response.status===401?'Sign in again to view analytics.':'Analytics could not be loaded. Try refreshing.');
      const data=await response.json();if(version!==generation)return;
      const s=data.sales,i=data.inventory;
      $('#analytics-metrics').innerHTML=[['Paid order value',money(s.revenueCents)],['Paid / fulfilled orders',s.paidOrders],['Average paid order',money(s.paidOrders?s.revenueCents/s.paidOrders:0)],['Awaiting payment',s.pendingOrders],['Unpaid order value',money(s.pendingCents)],['Cancelled orders',s.cancelledOrders]].map(([label,value])=>'<article class="analytics-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>').join('');
      $('#analytics-stock').innerHTML=[['Listings',i.listings],['Published',i.published],['Stock units',i.units],['Low stock (1–3)',i.lowStock],['Sold out',i.soldOut],['Stock at selling prices',money(i.stockRetailCents)]].map(([label,value])=>'<article class="analytics-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>').join('');
      const max=Math.max(1,...data.daily.map(d=>d.revenueCents));
      $('#analytics-daily').innerHTML=data.daily.length?data.daily.map(d=>'<div class="analytics-day"><span>'+esc(d.date)+'</span><meter min="0" max="'+max+'" value="'+d.revenueCents+'" aria-label="'+esc(d.date+' paid order value')+'"></meter><strong>'+esc(money(d.revenueCents))+'</strong></div>').join(''):'<p>No paid orders in this period yet.</p>';
      $('#analytics-top').innerHTML=data.topProducts.length?'<table><thead><tr><th>Product</th><th>Units sold</th><th>Item sales</th></tr></thead><tbody>'+data.topProducts.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+esc(p.units)+'</td><td>'+esc(money(p.revenueCents))+'</td></tr>').join('')+'</tbody></table>':'<p>Best sellers will appear after orders are paid.</p>';
      $('#analytics-status').textContent='Updated '+new Date(data.generatedAt).toLocaleTimeString('en-ZA')+'.';
    }catch(e){if(version===generation)$('#analytics-status').textContent=e.message;}
    finally{if(version===generation)$('#analytics-refresh').disabled=false;}
  }
  $('#analytics-days').addEventListener('change',load);$('#analytics-refresh').addEventListener('click',load);
  document.addEventListener('admin-analytics-open',load);
})();
