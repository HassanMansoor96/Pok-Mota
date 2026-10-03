'use strict';

const BASE = 'https://api.tcgdex.net/v2/en/';
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
function asset(value, suffix) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'assets.tcgdex.net' && !url.search && !url.hash && !url.username && !url.password ? value + suffix : '';
  } catch { return ''; }
}
function normalizeCard(card) {
  if (!card || !idPattern.test(card.id || '') || typeof card.name !== 'string' || !card.set?.name) throw new Error('Invalid card response');
  const total = card.set.cardCount?.official;
  return {
    name: card.name, set: card.set.name,
    number: String(card.localId ?? '') + (total ? '/' + total : ''),
    rarity: card.rarity || '', imageUrl: asset(card.image, '/high.webp'),
    description: card.description || '',
    cardMetadata: {
      provider: 'tcgdex', id: card.id, setId: card.set.id || '',
      setSymbolUrl: asset(card.set.symbol, '.webp'),
      cardCategory: card.category || '',
      types: Array.isArray(card.types) ? card.types : [],
      illustrator: card.illustrator || '',
    },
  };
}
function createCatalogue(fetcher = fetch) {
  const cache = new Map();
  const prices = require('./market-prices').createMarketPrices(fetcher);
  async function get(resource) {
    const old = cache.get(resource);
    if (old && old.expires > Date.now()) return old.data;
    const response = await fetcher(BASE + resource, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' }, redirect: 'error' });
    if (!response.ok) {
      const error = new Error('Card catalogue unavailable');
      error.status = response.status === 404 ? 404 : 503;
      throw error;
    }
    const data = await response.json();
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(resource, { data, expires: Date.now() + 10 * 60 * 1000 });
    return data;
  }
  return {
    async sets() {
      const data = await get('sets');
      if (!Array.isArray(data)) throw Error('Invalid sets response');
      return data.map(s => ({ id: s.id, name: s.name })).filter(s => idPattern.test(s.id || '') && typeof s.name === 'string').sort((a,b) => a.name.localeCompare(b.name));
    },
    async search({ name = '', set = '', page = '1' }) {
      if (typeof name !== 'string' || name.length > 100 || typeof set !== 'string' || (set && !idPattern.test(set)) || typeof page !== 'string' || !/^[1-9]\d{0,3}$/.test(page) || (!set && name.trim().length < 2)) {
        const error = Error('Enter at least two letters or choose a set.'); error.status = 400; throw error;
      }
      let data, hasMore;
      const size = 20, current = Number(page);
      if (set) {
        const found = await get('sets/' + encodeURIComponent(set));
        if (!Array.isArray(found.cards)) throw Error('Invalid set response');
        const filtered = found.cards.filter(c => String(c.name).toLowerCase().includes(name.trim().toLowerCase()));
        data = filtered.slice((current - 1) * size, current * size);
        hasMore = current * size < filtered.length;
      } else {
        const query = new URLSearchParams({ name: name.trim(), 'pagination:page': String(current), 'pagination:itemsPerPage': String(size) });
        data = await get('cards?' + query);
        if (!Array.isArray(data)) throw Error('Invalid search response');
        hasMore = data.length === size;
      }
      return { cards: data.slice(0,size).filter(c => idPattern.test(c.id || '')).map(c => ({ id: c.id, name: String(c.name), number: String(c.localId ?? ''), imageUrl: asset(c.image, '/low.webp') })), page: current, hasMore };
    },
    async card(id) {
      if (typeof id !== 'string' || !idPattern.test(id)) { const error = Error('Invalid card ID'); error.status = 400; throw error; }
      const raw = await get('cards/' + encodeURIComponent(id));
      return {...normalizeCard(raw),marketPrices:await prices(raw)};
    },
  };
}
function mountCatalogue(app, auth) {
  const catalogue = createCatalogue();
  const handle = fn => async (req,res) => {
    try { res.set('Cache-Control','private, no-store').json(await fn(req)); }
    catch (error) { const status = error.status || 503; res.status(status).json({error: status === 400 ? error.message : status === 404 ? 'Card not found.' : 'Card search is temporarily unavailable. Try again or enter the details manually.'}); }
  };
  app.get('/api/admin/card-catalogue/sets', auth, handle(() => catalogue.sets()));
  app.get('/api/admin/card-catalogue/cards', auth, handle(req => catalogue.search(req.query)));
  app.get('/api/admin/card-catalogue/cards/:id', auth, handle(req => catalogue.card(req.params.id)));
}
module.exports = { createCatalogue, normalizeCard, mountCatalogue };
