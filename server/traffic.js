'use strict';
const crypto=require('node:crypto');
const paths=new Set(['/','/pokemota','/catalogue.html','/product.html','/collections.html','/about.html','/faq.html','/shipping.html','/contact.html','/privacy.html','/checkout.html','/account.html']);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function normalizeEvent(body,origin,userAgent=''){
  if(!body||!uuid(body.id)||!uuid(body.session)||typeof body.path!=='string'||!paths.has(body.path))return null;
  let referrer='';
  if(typeof body.referrer==='string'&&body.referrer.length<=253){
    try{const source=new URL('https://'+body.referrer);if(source.hostname===body.referrer&&source.hostname!==new URL(origin).hostname)referrer=source.hostname.toLowerCase();}catch{}
  }
  const device=/ipad|tablet/i.test(userAgent)?'tablet':/mobile|android|iphone/i.test(userAgent)?'mobile':'desktop';
  return {id:body.id,sessionHash:crypto.createHash('sha256').update(body.session).digest('hex'),path:body.path,referrer,device};
}
async function trafficReport(pool,days){
  const [summary,daily,pages,referrers,devices]=await Promise.all([
    pool.query(`SELECT count(*)::int AS "pageViews",count(DISTINCT session_hash)::int AS visits,
      count(*) FILTER (WHERE created_at>=now()-interval '30 minutes')::int AS "recentPageViews",
      min(created_at) AS "firstViewAt" FROM site_page_views WHERE created_at>=now()-$1::int*interval '1 day'`,[days]),
    pool.query(`SELECT (created_at AT TIME ZONE 'Africa/Johannesburg')::date::text AS date,
      count(*)::int AS "pageViews",count(DISTINCT session_hash)::int AS visits
      FROM site_page_views WHERE created_at>=now()-$1::int*interval '1 day' GROUP BY 1 ORDER BY 1`,[days]),
    pool.query(`SELECT path,count(*)::int AS "pageViews",count(DISTINCT session_hash)::int AS visits
      FROM site_page_views WHERE created_at>=now()-$1::int*interval '1 day' GROUP BY path ORDER BY "pageViews" DESC,path LIMIT 10`,[days]),
    // Use the earliest retained page in each session, so internal navigation doesn't become a new referral.
    pool.query(`SELECT referrer,count(*)::int AS visits FROM (
      SELECT DISTINCT ON (session_hash) referrer,created_at FROM site_page_views ORDER BY session_hash,created_at,id
      ) entries WHERE created_at>=now()-$1::int*interval '1 day' GROUP BY referrer ORDER BY visits DESC,referrer LIMIT 10`,[days]),
    pool.query(`SELECT device,count(*)::int AS "pageViews" FROM site_page_views
      WHERE created_at>=now()-$1::int*interval '1 day' GROUP BY device ORDER BY "pageViews" DESC,device`,[days])
  ]);
  return {days,generatedAt:new Date().toISOString(),summary:summary.rows[0]||{pageViews:0,visits:0,recentPageViews:0,firstViewAt:null},daily:daily.rows,pages:pages.rows,referrers:referrers.rows,devices:devices.rows};
}
function mountTraffic(app,pool,auth){
  let cleanupAt=0;
  app.post('/api/traffic',async(req,res)=>{
    const origin=process.env.PUBLIC_ORIGIN||req.protocol+'://'+req.get('host');
    if(req.get('origin')!==origin)return res.status(403).end();
    if(req.get('dnt')==='1'||req.get('sec-gpc')==='1'||/bot|crawler|spider|headless|preview|facebookexternalhit|whatsapp/i.test(req.get('user-agent')||''))return res.status(204).end();
    const event=normalizeEvent(req.body,origin,req.get('user-agent'));
    if(!event)return res.status(400).json({error:'Invalid page view.'});
    try{
      await pool.query('INSERT INTO site_page_views(id,session_hash,path,referrer,device) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[event.id,event.sessionHash,event.path,event.referrer,event.device]);
      if(Date.now()>=cleanupAt){cleanupAt=Date.now()+3600000;pool.query("DELETE FROM site_page_views WHERE created_at<now()-interval '95 days'").catch(()=>{cleanupAt=0;});}
      res.set('Cache-Control','no-store').status(204).end();
    }catch{res.status(503).json({error:'Traffic recording unavailable.'});}
  });
  app.get('/api/admin/traffic',auth,async(req,res,next)=>{
    const days=req.query.days===undefined?30:Number(req.query.days);
    if(typeof req.query.days==='object'||![7,30,90].includes(days))return res.status(400).json({error:'Choose 7, 30 or 90 days.'});
    try{res.set('Cache-Control','private, no-store').json(await trafficReport(pool,days));}catch(error){next(error);}
  });
}
module.exports={paths,normalizeEvent,trafficReport,mountTraffic};
