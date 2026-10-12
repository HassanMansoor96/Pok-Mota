'use strict';
const finite = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
function offersFrom(card) {
  const pricing=card.pricing||{},offers=[];
  const tcg=pricing.tcgplayer;
  if(tcg && (!tcg.unit || tcg.unit==='USD')) for(const [variant,value] of Object.entries(tcg)) {
    if(value && finite(value.marketPrice)) offers.push({source:'TCGplayer',variant,currency:'USD',amount:value.marketPrice,updated:tcg.updated||null,kind:'Market price'});
  }
  const market=pricing.cardmarket;
  if(market && (!market.unit || market.unit==='EUR')) for(const [variant,key] of [['Standard','trend'],['Holo','trend-holo']]) {
    if(finite(market[key])) offers.push({source:'Cardmarket',variant,currency:'EUR',amount:market[key],updated:market.updated||null,kind:'Trend price'});
  }
  return offers;
}
function createMarketPrices(fetcher=fetch) {
  const rates=new Map();
  async function exchange(currency) {
    const cached=rates.get(currency);if(cached && cached.until>Date.now())return cached;
    const response=await fetcher('https://api.frankfurter.dev/v2/rate/'+currency.toLowerCase()+'/zar',{signal:AbortSignal.timeout(7000),redirect:'error'});
    if(!response.ok)throw Error('Exchange rate unavailable');
    const data=await response.json();
    if(!finite(data.rate)||!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||Date.now()-Date.parse(data.date)>7*86400000)throw Error('Exchange rate unavailable');
    const result={rate:data.rate,date:data.date,until:Date.now()+3600000};rates.set(currency,result);return result;
  }
  return async card=>{
    const offers=offersFrom(card);
    const currencies=[...new Set(offers.map(o=>o.currency))];
    const fx=Object.fromEntries(await Promise.all(currencies.map(async c=>{try{return [c,await exchange(c)];}catch{return [c,null];}})));
    return offers.map((o,i)=>{
      const date=typeof o.updated==='number'?new Date(o.updated<1e12?o.updated*1000:o.updated):new Date(o.updated||NaN);
      const updated=Number.isFinite(date.getTime())?date.toISOString():null;
      const stale=!updated||Date.now()-date.getTime()>7*86400000;
      const rate=fx[o.currency];const cents=rate?Math.round(o.amount*rate.rate*100):null;
      return {...o,id:String(i),updated,stale,rate:rate?.rate||null,rateDate:rate?.date||null,zarCents:Number.isSafeInteger(cents)&&cents>0&&cents<=100000000?cents:null};
    });
  };
}
module.exports={offersFrom,createMarketPrices};
