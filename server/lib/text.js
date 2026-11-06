// Basic text-quality checks used by the misuse risk score.
const ABUSIVE = [
  'fuck', 'fucking', 'shit', 'bitch', 'bastard', 'asshole', 'dickhead', 'cunt', 'motherfucker',
  'madarchod', 'bhenchod', 'chutiya', 'harami', 'bevarsi', 'sule maga', 'nin amman',
];
const ABUSIVE_RE = new RegExp(`(^|[^a-z])(${ABUSIVE.map((w) => w.replace(/\s+/g, '\\s*')).join('|')})`, 'i');
const KEYBOARD_MASH = /(asdf|qwer|zxcv|hjkl|sdfg|dfgh|fghj|ghjk|wert|erty|rtyu|xcvb|cvbn|vbnm)/i;

export function analyseText(input) {
  const text = String(input || '').trim();
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const letters = (text.match(/\p{L}/gu) || []).length;
  const hasKannada = /[ಀ-೿]/.test(text);

  let latinWords = 0;
  let noVowel = 0;
  for (const w of words) {
    if (/^[a-z]{5,}$/.test(w)) {
      latinWords++;
      if (!/[aeiouy]/.test(w)) noVowel++;
    }
  }
  const uniqueRatio = words.length ? new Set(words).size / words.length : 1;
  const reasons = [];
  if (/(.)\1{5,}/u.test(text)) reasons.push('long repeated characters');
  if (!hasKannada && KEYBOARD_MASH.test(lower)) reasons.push('keyboard mashing');
  if (!hasKannada && latinWords >= 3 && noVowel / latinWords > 0.4) reasons.push('random letters');
  if (words.length >= 6 && uniqueRatio < 0.35) reasons.push('same words repeated');
  if (text.length > 15 && letters < text.length * 0.45) reasons.push('mostly symbols or numbers');

  return {
    length: text.length,
    gibberish: reasons.length > 0,
    gibberishReasons: reasons,
    abusive: ABUSIVE_RE.test(lower),
  };
}
