import crypto from 'node:crypto';

// Non-sequential public reference, e.g. NB-K7QX-3MPA.
// Alphabet avoids look-alike characters (0/O, 1/I/L). 31^8 ≈ 850 billion combinations,
// so references cannot be guessed or enumerated.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function newReference() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `NB-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normaliseReference(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = raw.startsWith('NB') ? raw.slice(2) : raw;
  if (body.length !== 8) return null;
  return `NB-${body.slice(0, 4)}-${body.slice(4)}`;
}
