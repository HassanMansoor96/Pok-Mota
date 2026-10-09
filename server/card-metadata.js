'use strict';
const types = new Set(['Colorless','Darkness','Dragon','Fairy','Fighting','Fire','Grass','Lightning','Metal','Psychic','Water']);
function validateMetadata(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid card metadata');
  const out = {};
  for (const [key,max] of Object.entries({marketVariant:80,marketSource:40,provider:20,id:80,setId:80,setSymbolUrl:500,cardCategory:20,illustrator:160})) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > max)) throw Error('Invalid card '+key);
    out[key] = value[key] || '';
  }
  if (out.provider && !['tcgdex','tcgcsv'].includes(out.provider)) throw Error('Invalid card provider');
  if (out.cardCategory && !['Pokemon','Trainer','Energy'].includes(out.cardCategory)) throw Error('Invalid card category');
  if (out.setSymbolUrl) {
    const url = new URL(out.setSymbolUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'assets.tcgdex.net' || url.username || url.password) throw Error('Invalid set symbol URL');
  }
  if (value.types !== undefined && (!Array.isArray(value.types) || value.types.length > 3 || value.types.some(t => !types.has(t)))) throw Error('Invalid Pokemon types');
  out.types = [...new Set(value.types || [])];
  return out;
}
module.exports = { validateMetadata };
