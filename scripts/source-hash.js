import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, out) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Hash of everything that affects the built web app (line endings normalised). */
export function clientSourceHash() {
  const files = [
    ...walk(join(ROOT, 'client', 'src'), []),
    ...walk(join(ROOT, 'client', 'public'), []),
    join(ROOT, 'client', 'index.html'),
    join(ROOT, 'vite.config.ts'),
  ].filter(existsSync);
  const h = createHash('sha256');
  for (const f of files) {
    h.update(relative(ROOT, f).replace(/\\/g, '/'));
    h.update(readFileSync(f).toString('utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex');
}
