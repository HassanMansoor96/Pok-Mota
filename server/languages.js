'use strict';
const languages = ['en', 'ja', 'zh-cn', 'zh-tw'];
function validateLanguage(value = 'en') {
  if (typeof value !== 'string' || !languages.includes(value)) {
    throw Object.assign(Error('Choose a supported product language.'), { status: 400 });
  }
  return value;
}
module.exports = { validateLanguage };
