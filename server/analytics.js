'use strict';
async function analytics(pool, days) {
  const [sales, inventory, daily, top] = await Promise.all([
    pool.query(`SELECT count(*)::int AS orders,
      count(*) FILTER (WHERE status IN ('paid','fulfilled'))::int AS "paidOrders",
      count(*) FILTER (WHERE status='pending_payment')::int AS "pendingOrders",
      count(*) FILTER (WHERE status='cancelled')::int AS "cancelledOrders",
      COALESCE(sum(total_cents) FILTER (WHERE status IN ('paid','fulfilled')),0)::bigint AS "revenueCents",
      COALESCE(sum(total_cents) FILTER (WHERE status='pending_payment'),0)::bigint AS "pendingCents"
      FROM orders WHERE created_at >= now() - $1 * interval '1 day'`, [days]),
    pool.query(`SELECT count(*)::int AS listings,
      count(*) FILTER (WHERE is_published)::int AS published,
      count(*) FILTER (WHERE stock=0)::int AS "soldOut",
      count(*) FILTER (WHERE stock BETWEEN 1 AND 3)::int AS "lowStock",
      COALESCE(sum(stock),0)::bigint AS units,
      COALESCE(sum(stock::bigint*price_cents),0)::bigint AS "stockRetailCents" FROM products`),
    pool.query(`SELECT (created_at AT TIME ZONE 'Africa/Johannesburg')::date::text AS date,
      count(*)::int AS orders, sum(total_cents)::bigint AS "revenueCents"
      FROM orders WHERE created_at >= now() - $1 * interval '1 day' AND status IN ('paid','fulfilled')
      GROUP BY 1 ORDER BY 1`, [days]),
    pool.query(`SELECT item->>'id' AS id, max(item->>'name') AS name,
      sum((item->>'quantity')::int)::bigint AS units,
      sum((item->>'lineCents')::bigint)::bigint AS "revenueCents"
      FROM orders CROSS JOIN LATERAL jsonb_array_elements(items) AS item
      WHERE created_at >= now() - $1 * interval '1 day' AND status IN ('paid','fulfilled')
      GROUP BY item->>'id' ORDER BY "revenueCents" DESC LIMIT 10`, [days])
  ]);
  const numbers = row => Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='string' && /^\d+$/.test(v)?Number(v):v]));
  return {days, generatedAt:new Date().toISOString(), sales:numbers(sales.rows[0]||{}), inventory:numbers(inventory.rows[0]||{}), daily:daily.rows.map(numbers), topProducts:top.rows.map(numbers)};
}
function mountAnalytics(app,pool,auth) {
  app.get('/api/admin/analytics',auth,async(req,res,next)=>{
    const days=req.query.days===undefined?30:Number(req.query.days);
    if(typeof req.query.days==='object'||![7,30,90].includes(days))return res.status(400).json({error:'Choose 7, 30 or 90 days.'});
    try{res.set('Cache-Control','private, no-store').json(await analytics(pool,days));}catch(error){next(error);}
  });
}
module.exports={analytics,mountAnalytics};
