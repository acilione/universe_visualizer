const STORAGE_KEY = 'aether.language';
function storedLanguage() {
  try { return globalThis.localStorage?.getItem(STORAGE_KEY) === 'it' ? 'it' : 'en'; }
  catch { return 'en'; }
}
let language = storedLanguage();

/** English is the default. Italian is used only after an explicit preference. */
export const getLanguage = () => language;
export function setLanguage(code) {
  if (!['en', 'it'].includes(code)) throw new RangeError('Unsupported language.');
  language = code;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, code); } catch { /* Private storage can be unavailable. */ }
  return language;
}
export const t = (english, italian) => language === 'it' ? italian : english;
export const locale = () => language === 'it' ? 'it-IT' : 'en-US';
export const formatNumber = (value, options = {}) => new Intl.NumberFormat(locale(), options).format(value);
