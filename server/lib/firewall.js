// Application firewall. Free hosting (Render free) has no firewall of its own, so the
// app protects itself:
//   • bans  – IPs that attack or flood are refused for a while (stored in MongoDB)
//   • rate limits – per-IP token buckets for all requests and, tighter, for writes
//   • probes – requests for /wp-admin, /.env, *.php, ../ etc. are refused and counted
//   • scanners – known attack tools (sqlmap, nikto, …) are refused
//   • uploads – limits how many photo/video uploads run at once (protects 512 MB RAM)
// Repeated violations add "strikes"; enough strikes in 10 minutes = automatic ban.
import jwt from 'jsonwebtoken';
import { config } from '../env.js';
import { FirewallBan, AuditLog } from '../models/index.js';
import { getSettings } from './settings.js';

const MIN = 60000;

const bans = new Map(); // ip -> { until: number|null, reason, auto, count, at }
const buckets = new Map(); // `${kind}:${ip}` -> { tokens, last }
const strikes = new Map(); // ip -> [{ at, weight, reason }]
const uploads = new Map(); // ip -> number of uploads in progress
let uploadsTotal = 0;
const events = []; // last 300 firewall events
const counters = { since: Date.now(), checked: 0, banned: 0, rateLimited: 0, probes: 0, scanners: 0, uploadsBusy: 0, autoBans: 0 };

const PROBE_PATTERNS = [
  /\.(php\d?|asp|aspx|jsp|cgi|env|git|svn|htaccess|htpasswd|ini|bak|sql|swp|ds_store)(\/|$|\?)/i,
  /\/(wp-admin|wp-login|wp-content|wp-includes|xmlrpc|phpmyadmin|pma|myadmin|cgi-bin|vendor\/phpunit|actuator|server-status|boaform|hnap1|owa|autodiscover|solr|jenkins|manager\/html)(\/|$|\?|\.|-)/i,
  /(\.\.\/|\.\.\\|%2e%2e|%252e%252e)/i,
  /(<script|%3cscript|javascript:|union(\s|%20|\+)+select|sleep\(|benchmark\(|\$where|\$ne\b|\[\$)/i,
  /\/etc\/passwd|\/proc\/self|cmd\.exe|\/bin\/(ba)?sh/i,
];
const SCANNER_UA = /(sqlmap|nikto|nmap|masscan|zgrab|nuclei|wpscan|dirbuster|gobuster|ffuf|feroxbuster|acunetix|netsparker|nessus|openvas|w3af|havij|jaeles|whatweb|commix)/i;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const UPLOAD_ROUTES = [/^\/api\/public\/reports$/, /^\/api\/public\/reports\/[^/]+\/respond$/, /^\/api\/official\/reports\/[^/]+\/status$/];
const MAX_UPLOADS_PER_IP = 2;
const MAX_UPLOADS_TOTAL = 6;

function ipOf(req) {
  let ip = req.ip || req.socket?.remoteAddress || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

const isLoopbackIp = (ip) => ip === '127.0.0.1' || ip === '::1';

function log(type, ip, req, detail = '') {
  events.push({ at: Date.now(), type, ip, method: req?.method, path: req ? String(req.originalUrl || req.url).slice(0, 160) : '', ua: req ? String(req.headers['user-agent'] || '').slice(0, 120) : '', detail });
  if (events.length > 300) events.shift();
}

// The signed-in administrator is never rate-limited (they may share a college Wi-Fi IP).
function isAdminRequest(req) {
  const m = /(?:^|;\s*)nb_off=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  try {
    const p = jwt.verify(decodeURIComponent(m[1]), config.secret);
    return p.typ === 'off' && p.role === 'admin';
  } catch {
    return false;
  }
}

function take(kind, ip, perMinute, burst) {
  const key = `${kind}:${ip}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: burst, last: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(burst, b.tokens + ((now - b.last) / MIN) * perMinute);
  b.last = now;
  if (b.tokens < 1) return Math.ceil(((1 - b.tokens) / perMinute) * 60); // seconds to wait
  b.tokens -= 1;
  return 0;
}

function activeBan(ip) {
  const b = bans.get(ip);
  if (!b) return null;
  if (b.until && b.until <= Date.now()) {
    bans.delete(ip);
    return null;
  }
  return b;
}

export async function banIp(ip, { minutes, reason, auto = false, byName = 'Firewall' }) {
  const prev = await FirewallBan.findOne({ ip }).lean();
  const until = minutes ? new Date(Date.now() + minutes * MIN) : null;
  const doc = await FirewallBan.findOneAndUpdate(
    { ip },
    { $set: { until, reason, auto, byName }, $inc: { count: 1 } },
    { upsert: true, new: true }
  ).lean();
  bans.set(ip, { until: until ? until.getTime() : null, reason, auto, count: doc.count, at: Date.now() });
  strikes.delete(ip);
  if (auto) counters.autoBans++;
  AuditLog.create({
    actorType: auto ? 'system' : 'official',
    actorName: byName,
    actorRole: auto ? 'system' : 'admin',
    action: auto ? 'FIREWALL_AUTO_BAN' : 'FIREWALL_BAN',
    targetType: 'ip',
    targetId: ip,
    details: { minutes: minutes || 'permanent', reason, previousBans: prev?.count || 0 },
  }).catch(() => {});
  return doc;
}

export async function unbanIp(ip) {
  bans.delete(ip);
  strikes.delete(ip);
  for (const k of buckets.keys()) if (k.endsWith(`:${ip}`)) buckets.delete(k);
  await FirewallBan.deleteOne({ ip });
}

async function strike(ip, weight, reason, settings) {
  const now = Date.now();
  const list = (strikes.get(ip) || []).filter((s) => now - s.at < 10 * MIN);
  list.push({ at: now, weight, reason });
  strikes.set(ip, list);
  const total = list.reduce((a, s) => a + s.weight, 0);
  if (total >= 10 && !activeBan(ip)) {
    // escalate: 1st ban = fwBanMinutes, 2nd = ×6, 3rd+ = ×24 (60 min → 6 h → 24 h by default)
    const prev = await FirewallBan.findOne({ ip }, { count: 1 }).lean();
    const n = (prev?.count || 0) + 1;
    const minutes = settings.fwBanMinutes * (n === 1 ? 1 : n === 2 ? 6 : 24);
    const reasons = [...new Set(list.map((s) => s.reason))].join(', ');
    await banIp(ip, { minutes, reason: `Automatic: ${reasons}`, auto: true });
  }
}

function refuse(req, res, status, code, message, extraHeaders = {}) {
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.setHeader('Cache-Control', 'no-store');
  if (req.path.startsWith('/api/') || !req.accepts('html')) {
    return res.status(status).json({ error: { code, message } });
  }
  return res
    .status(status)
    .type('html')
    .send(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nimma Bengaluru</title><body style="font-family:system-ui,sans-serif;background:#fbf3e4;color:#2b2733;padding:32px;max-width:560px;margin:auto"><h2>Request blocked</h2><p>${message}</p><p style="color:#6d6575">Nimma Bengaluru firewall</p></body>`
    );
}

export async function loadBans() {
  const rows = await FirewallBan.find({ $or: [{ until: null }, { until: { $gt: new Date() } }] }).lean();
  for (const b of rows) bans.set(b.ip, { until: b.until ? new Date(b.until).getTime() : null, reason: b.reason, auto: b.auto, count: b.count, at: new Date(b.updatedAt).getTime() });
  return rows.length;
}

/** Express middleware – mount first, right after `trust proxy`. */
export function firewall() {
  return async (req, res, next) => {
    try {
      const s = await getSettings();
      if (!s.firewallEnabled) return next();
      const ip = ipOf(req);
      counters.checked++;
      // the computer running the app and Render's health checks are always allowed
      if (isLoopbackIp(ip) || req.path === '/api/system/health') return next();

      const ban = activeBan(ip);
      if (ban) {
        counters.banned++;
        log('blocked-banned', ip, req, ban.reason);
        const when = ban.until ? `until ${new Date(ban.until).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}` : 'permanently';
        return refuse(req, res, 403, 'FIREWALL_BANNED', `Your network has been blocked ${when} because of suspicious activity. If this is a mistake, contact the administrator.`);
      }

      if (!ALLOWED_METHODS.has(req.method)) {
        log('bad-method', ip, req);
        await strike(ip, 3, 'unusual HTTP method', s);
        return refuse(req, res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      }
      const url = String(req.originalUrl || req.url);
      if (url.length > 2048) {
        log('url-too-long', ip, req);
        await strike(ip, 2, 'oversized URL', s);
        return refuse(req, res, 414, 'URI_TOO_LONG', 'Request address too long.');
      }
      let decoded = url;
      try {
        decoded = decodeURIComponent(url);
      } catch {
        /* keep raw */
      }
      if (PROBE_PATTERNS.some((re) => re.test(url) || re.test(decoded))) {
        counters.probes++;
        log('attack-probe', ip, req);
        await strike(ip, 4, 'attack / vulnerability probe', s);
        return refuse(req, res, 404, 'NOT_FOUND', 'Not found.');
      }
      const ua = String(req.headers['user-agent'] || '');
      if (SCANNER_UA.test(ua)) {
        counters.scanners++;
        log('scanner', ip, req);
        await strike(ip, 5, 'hacking tool', s);
        return refuse(req, res, 403, 'FORBIDDEN', 'Automated scanning is not allowed.');
      }

      const admin = isAdminRequest(req);
      const staticAsset = req.method === 'GET' && /^\/(assets\/|favicon|manifest|robots\.txt)/.test(req.path);
      if (!admin && !staticAsset) {
        const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        const wait = take('all', ip, s.fwRequestsPerMinute, Math.max(60, Math.round(s.fwRequestsPerMinute / 2))) || (write ? take('write', ip, 40, 25) : 0);
        if (wait) {
          counters.rateLimited++;
          log('rate-limited', ip, req, write ? 'write' : 'all');
          await strike(ip, 1, 'request flood', s);
          return refuse(req, res, 429, 'RATE_LIMITED', `Too many requests from your network. Please wait ${wait} seconds.`, { 'Retry-After': String(wait) });
        }
      }

      // limit simultaneous photo/video uploads (each can hold up to 25 MB in memory)
      if (req.method === 'POST' && UPLOAD_ROUTES.some((re) => re.test(req.path))) {
        const mine = uploads.get(ip) || 0;
        if (mine >= MAX_UPLOADS_PER_IP || uploadsTotal >= MAX_UPLOADS_TOTAL) {
          counters.uploadsBusy++;
          log('uploads-busy', ip, req, `${mine} from this IP, ${uploadsTotal} total`);
          return refuse(req, res, 503, 'SERVER_BUSY', 'The server is busy with other uploads (it runs on a free plan). Please try again in a few seconds.', { 'Retry-After': '10' });
        }
        uploads.set(ip, mine + 1);
        uploadsTotal++;
        let done = false;
        const release = () => {
          if (done) return;
          done = true;
          uploadsTotal = Math.max(0, uploadsTotal - 1);
          const n = (uploads.get(ip) || 1) - 1;
          if (n <= 0) uploads.delete(ip);
          else uploads.set(ip, n);
        };
        res.on('finish', release);
        res.on('close', release);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// keep memory small: forget idle buckets and old strikes
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.last > 30 * MIN) buckets.delete(k);
  for (const [ip, list] of strikes) if (!list.some((s) => now - s.at < 10 * MIN)) strikes.delete(ip);
  for (const ip of bans.keys()) activeBan(ip);
}, 5 * MIN).unref();

export function firewallStatus() {
  const now = Date.now();
  const top = new Map();
  for (const e of events) if (e.type !== 'blocked-banned') top.set(e.ip, (top.get(e.ip) || 0) + 1);
  return {
    counters,
    activeBans: [...bans.entries()]
      .filter(([, b]) => !b.until || b.until > now)
      .map(([ip, b]) => ({ ip, until: b.until ? new Date(b.until) : null, reason: b.reason, auto: b.auto, count: b.count })),
    watching: [...strikes.entries()].map(([ip, list]) => ({ ip, score: list.reduce((a, s) => a + s.weight, 0), reasons: [...new Set(list.map((s) => s.reason))] })).sort((a, b) => b.score - a.score).slice(0, 20),
    topOffenders: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, n]) => ({ ip, events: n })),
    recent: events.slice(-100).reverse(),
    uploadsInProgress: uploadsTotal,
  };
}
