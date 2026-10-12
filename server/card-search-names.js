'use strict';
// Names from PokeAPI's pokemon_species_names.csv (see README attribution).
const names = require('./pokemon-names.json').sort((a,b)=>b.en.length-a.en.length);
function searchName(input, language) {
  const name = input.trim();
  if (language === 'en' || !/^[\x20-\x7e]+$/.test(name)) return name;
  const match = names.find(p => p[language] && (name.toLowerCase() === p.en.toLowerCase() || name.toLowerCase().startsWith(p.en.toLowerCase()+' ')));
  // Search all printings of the species; card suffixes vary by language.
  return match ? match[language] : name;
}
module.exports = { searchName };
