// Writes a hash of the client sources into client/dist so the launcher knows
// whether the web app needs rebuilding on this computer.
import { writeFileSync } from 'node:fs';
import { clientSourceHash } from './source-hash.js';

writeFileSync(new URL('../client/dist/.build-stamp', import.meta.url), clientSourceHash());
console.log('  ✓ build stamp written');
