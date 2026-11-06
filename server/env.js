// Loads settings from the .env file and exposes a single `config` object.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env parser (KEY=value, # comments, optional quotes). No dependency needed.
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  const parsed = parseEnv(fs.readFileSync(envPath, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

// Render (render.com) sets RENDER=true on its servers. When we detect it we switch to
// "cloud mode": Render provides HTTPS, the app sits behind Render's proxy, and the
// built-in local database is never used.
const onRender = process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID);

// Which proxies may tell us the visitor's real IP (X-Forwarded-For).
// 'loopback' = only a tunnel on this computer; a number = that many proxy hops (Render: 1).
function parseTrustProxy(v, fallback) {
  if (v === undefined || v === '') return fallback;
  if (/^\d+$/.test(v)) return Number(v);
  if (/^(true|yes|on)$/i.test(v)) return true;
  if (/^(false|no|off)$/i.test(v)) return false;
  return v; // e.g. 'loopback' or a comma-separated list of addresses
}

const dataDir = path.join(ROOT, 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Use the secret from .env; otherwise keep a generated one in data/ so logins survive restarts.
function resolveSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) return process.env.JWT_SECRET;
  const file = path.join(dataDir, '.secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, s);
  return s;
}

export const config = {
  root: ROOT,
  dataDir,
  clientDist: path.join(ROOT, 'client', 'dist'),
  mongoUri: (process.env.MONGODB_URI || '').trim(),
  dbMode: (process.env.DB_MODE || (onRender ? 'atlas' : 'auto')).toLowerCase(), // auto | atlas | local
  dbName: process.env.DB_NAME || 'nimma_bengaluru',
  port: int(process.env.PORT, 3000),
  httpsPort: int(process.env.HTTPS_PORT, 3443),
  enableHttps: bool(process.env.ENABLE_HTTPS, !onRender),
  onRender,
  hosting: onRender ? 'render' : 'local',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY, onRender ? 1 : 'loopback'),
  secret: resolveSecret(),
  smsMode: (process.env.SMS_MODE || 'demo').toLowerCase(), // demo | twilio | fast2sms (optional report receipts)
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
  },
  fast2smsKey: process.env.FAST2SMS_API_KEY || '',
  seedDemoData: bool(process.env.SEED_DEMO_DATA, true),
  openBrowser: onRender ? false : bool(process.env.OPEN_BROWSER, false),
  publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''),
  // Free-tier limits (override in .env if your plan is different)
  limits: {
    dbStorageMb: num(process.env.DB_STORAGE_LIMIT_MB, 512), // MongoDB Atlas free cluster: 0.5 GB
    dbTransferGbPerWeek: num(process.env.DB_TRANSFER_LIMIT_GB, 10), // Atlas free: 10 GB out per rolling 7 days
    hostHoursPerMonth: num(process.env.HOST_HOURS_LIMIT, 750), // Render free: 750 instance hours / month
    hostBandwidthGbPerMonth: num(process.env.HOST_BANDWIDTH_LIMIT_GB, 100), // Render free: 100 GB / month
  },
  appName: 'Nimma Bengaluru',
};
