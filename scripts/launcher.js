// Build the browser app when its sources changed, then start the API server.
// This uses Node APIs so it works on Windows and macOS.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { clientSourceHash } from './source-hash.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'client', 'dist');
const stamp = path.join(dist, '.build-stamp');
const index = path.join(dist, 'index.html');

function buildIfNeeded() {
  let builtHash = '';
  try {
    builtHash = fs.readFileSync(stamp, 'utf8').trim();
  } catch {
    // A clean checkout has no build stamp.
  }

  if (fs.existsSync(index) && builtHash === clientSourceHash()) return;

  console.log('\n  > Building the web app...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    throw new Error(`Could not run npm build: ${result.error.message}. Install project dependencies with npm ci first.`);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

buildIfNeeded();
await import('../server/index.js');
