'use strict';

const BASE = 'https://tcgcsv.com/tcgplayer/';
const { validateLanguage } = require('./languages');
function category(language) {
  validateLanguage(language);
  if (!['en', 'ja'].includes(language)) throw Object.assign(Error('Chinese sealed products must be entered manually.'), { status: 400 });
  return language === 'ja' ? 85 : 3;
}
const validId = value => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value);
const sealedName = /\b(booster (box|pack|bundle)|elite trainer box|collection|blister|tin|build [&and ]+ battle|battle deck|theme deck|premium tournament|trainer toolkit|trainer.s toolkit|box set)\b/i;
function isSealed(product, categoryId = 3) {
  const fields = Array.isArray(product.extendedData) ? product.extendedData : [];
  return product.categoryId === categoryId && Number.isSafeInteger(product.productId) && typeof product.name === 'string'
    && !fields.some(f => ['Number', 'Rarity'].includes(f.name) && f.value)
    && !/\b(code card|jumbo|oversized|sleeves|playmat)\b/i.test(product.name) && sealedName.test(product.name);
}
function imageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'tcgplayer-cdn.tcgplayer.com' && !url.username && !url.password && !url.search && !url.hash
      ? url.href.replace('_200w.', '_in_1000x1000.') : '';
  } catch { return ''; }
}
function createSealedCatalogue(fetcher = fetch) {
  const cache = new Map();
  const marketPrices = require('./market-prices').createMarketPrices(fetcher);
  async function get(resource, language = 'en') {
    resource = category(language) + '/' + resource;
    const old = cache.get(resource);
    if (old && old.expires > Date.now()) return old.promise;
    const promise = (async () => {
      const response = await fetcher(BASE + resource, { signal: AbortSignal.timeout(10000), redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'HM-Collectables/0.2.0' } });
      if (!response.ok) throw Object.assign(Error('Catalogue unavailable'), { status: response.status === 404 ? 404 : 503 });
      const data = await response.json();
      if (data.success !== true || !Array.isArray(data.results)) throw Error('Invalid catalogue response');
      return { results: data.results, updated: data.updated || null };
    })();
    cache.set(resource, { promise, expires: Date.now() + 86400000 });
    try { return await promise; } catch (error) { cache.delete(resource); throw error; }
  }
  async function sets(language = 'en') {
    return (await get('groups', language)).results.filter(s => validId(String(s.groupId)) && typeof s.name === 'string')
      .map(s => ({ id: String(s.groupId), name: s.name })).sort((a,b) => a.name.localeCompare(b.name));
  }
  async function products(set, language = 'en') {
    category(language);
    if (!validId(set)) throw Object.assign(Error('Choose a set to browse sealed products.'), { status: 400 });
    const group = (await sets(language)).find(s => s.id === set);
    if (!group) throw Object.assign(Error('Set not found'), { status: 404 });
    return (await get(set + '/products', language)).results.filter(p => isSealed(p, category(language))).map(p => ({ id: String(p.productId), name: p.name, set: group.name, imageUrl: imageUrl(p.imageUrl), category: 'sealed', number: '', rarity: '', description: '', condition: 'Factory sealed', tag: 'SEALED' }));
  }
  return {
    sets,
    async search({ set = '', name = '', page = '1', language = 'en' }) {
      if (typeof name !== 'string' || name.length > 100 || typeof page !== 'string' || !/^[1-9]\d{0,3}$/.test(page)) throw Object.assign(Error('Invalid search.'), { status: 400 });
      const found = (await products(set, language)).filter(p => p.name.toLowerCase().includes(name.trim().toLowerCase()));
      const current = Number(page);
      return { products: found.slice((current-1)*20, current*20), page: current, hasMore: current*20 < found.length };
    },
    async product(set, id, language = 'en') {
      if (!validId(id)) throw Object.assign(Error('Invalid product ID.'), { status: 400 });
      const product = (await products(set, language)).find(p => p.id === id);
      if (!product) throw Object.assign(Error('Product not found'), { status: 404 });
      let offers = [];
      try {
        const data = await get(set + '/prices', language);
        const tcgplayer = { unit: 'USD', updated: data.updated };
        for (const price of data.results.filter(p => String(p.productId) === id)) {
          tcgplayer[price.subTypeName || 'Sealed'] = { marketPrice: price.marketPrice };
        }
        offers = await marketPrices({ pricing: { tcgplayer } });
      } catch { /* Product details remain usable when pricing is unavailable. */ }
      return { ...product, cardMetadata: { provider: 'tcgcsv', id, setId: set, language }, marketPrices: offers };
    },
  };
}
function mountSealedCatalogue(app, auth) {
  const catalogue = createSealedCatalogue();
  const handle = fn => async (req,res) => {
    try { res.set('Cache-Control', 'private, no-store').json(await fn(req)); }
    catch (error) { const status = error.status || 503; res.status(status).json({ error: status === 400 ? error.message : status === 404 ? 'Sealed product or set not found.' : 'Sealed catalogue is temporarily unavailable. Try again or enter details manually.' }); }
  };
  app.get('/api/admin/sealed-catalogue/sets', auth, handle(req => catalogue.sets(req.query.language)));
  app.get('/api/admin/sealed-catalogue/products', auth, handle(req => catalogue.search(req.query)));
  app.get('/api/admin/sealed-catalogue/sets/:set/products/:id', auth, handle(req => catalogue.product(req.params.set, req.params.id, req.query.language)));
}
module.exports = { createSealedCatalogue, mountSealedCatalogue, isSealed, imageUrl };
