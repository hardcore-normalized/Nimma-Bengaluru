// Free-tier usage monitor.
// Tracks how close the app is to the limits of the free plans it runs on and tells
// the administrator (and, when it matters, citizens) what is happening and what to do.
//
//   Database storage  – MongoDB Atlas free cluster: 0.5 GB of documents + indexes (whole cluster)
//   Database transfer – Atlas free: 10 GB out per rolling 7 days (we count photo/video
//                       traffic, which is most of it – an estimate)
//   Server hours      – Render free: 750 instance hours per month (counted while awake)
//   Server bandwidth  – Render free: 100 GB outbound per month
import mongoose from 'mongoose';
import { config } from '../env.js';
import { dbInfo } from '../db.js';
import { Usage, AuditLog, Setting } from '../models/index.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const pending = { bytesOut: 0, requests: 0, mediaIn: 0, mediaOut: 0 };
let lastFlush = Date.now();
let timer = null;

const monthKey = (d = new Date()) => `host-${d.toISOString().slice(0, 7)}`;
const dayKey = (d = new Date()) => `db-${d.toISOString().slice(0, 10)}`;

// ---------------------------------------------------------------- counting
/** Express middleware: counts requests and bytes sent (Render bandwidth). */
export function usageMeter() {
  return (req, res, next) => {
    const socket = req.socket;
    const start = socket?.bytesWritten || 0;
    pending.requests++;
    res.on('finish', () => {
      const sent = (socket?.bytesWritten || 0) - start;
      if (sent > 0) pending.bytesOut += sent;
    });
    next();
  };
}

export function countMediaIn(bytes) {
  pending.mediaIn += bytes || 0;
}
export function countMediaOut(bytes) {
  pending.mediaOut += bytes || 0;
}

async function flush() {
  if (mongoose.connection.readyState !== 1) return;
  const now = Date.now();
  const minutes = (now - lastFlush) / 60000;
  lastFlush = now;
  const p = { ...pending };
  pending.bytesOut = pending.requests = pending.mediaIn = pending.mediaOut = 0;
  try {
    await Promise.all([
      Usage.updateOne({ _id: monthKey() }, { $inc: { awakeMinutes: minutes, bytesOut: p.bytesOut, requests: p.requests } }, { upsert: true }),
      p.mediaIn || p.mediaOut ? Usage.updateOne({ _id: dayKey() }, { $inc: { mediaIn: p.mediaIn, mediaOut: p.mediaOut } }, { upsert: true }) : null,
    ]);
  } catch {
    // keep the numbers for the next try
    pending.bytesOut += p.bytesOut;
    pending.requests += p.requests;
    pending.mediaIn += p.mediaIn;
    pending.mediaOut += p.mediaOut;
  }
}

export function startUsageTracking() {
  lastFlush = Date.now();
  timer = setInterval(() => {
    flush().then(checkAndAlert).catch(() => {});
  }, 60000);
  timer.unref();
  setTimeout(() => checkAndAlert().catch(() => {}), 15000).unref();
}

export async function stopUsageTracking() {
  if (timer) clearInterval(timer);
  await flush().catch(() => {});
}

// ---------------------------------------------------------------- measuring
async function measureDbStorage() {
  const db = mongoose.connection.db;
  let names = [config.dbName];
  try {
    const list = await db.admin().listDatabases({ nameOnly: true });
    names = list.databases.map((d) => d.name).filter((n) => !['admin', 'local', 'config'].includes(n));
  } catch {
    names = [db.databaseName];
  }
  let total = 0;
  let mine = 0;
  for (const name of names) {
    try {
      const st = await mongoose.connection.client.db(name).stats();
      const size = (st.dataSize || 0) + (st.indexSize || 0); // Atlas counts uncompressed documents + indexes
      total += size;
      if (name === db.databaseName) mine = size;
    } catch {
      /* not allowed on this database */
    }
  }
  return { total, mine, databases: names.length };
}

const levelOf = (pct) => (pct >= 98 ? 'full' : pct >= 90 ? 'critical' : pct >= 80 ? 'warning' : 'ok');
const RANK = { ok: 0, warning: 1, critical: 2, full: 3 };

let cache = null;
let cacheAt = 0;

/** Current free-tier status. Cached for a minute (database stats are not free). */
export async function getUsageStatus({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < 60000) return cache;
  const L = config.limits;
  const now = new Date();
  const atlas = dbInfo.mode === 'atlas';
  const items = [];

  // database storage
  const storage = await measureDbStorage().catch(() => ({ total: 0, mine: 0, databases: 0 }));
  const storageLimit = L.dbStorageMb * MB;
  items.push({
    key: 'db-storage',
    label: 'Database storage',
    plan: atlas ? `MongoDB Atlas free cluster – ${L.dbStorageMb} MB` : 'Built-in local database (no free-tier limit)',
    applies: atlas,
    used: storage.total,
    limit: storageLimit,
    unit: 'bytes',
    pct: atlas ? Math.round((storage.total / storageLimit) * 1000) / 10 : 0,
    note: storage.databases > 1 ? `${storage.databases} databases on this cluster count towards the limit (this app: ${(storage.mine / MB).toFixed(1)} MB).` : '',
    advice: [
      'Free up space: delete videos of closed complaints (button below). Photos and fake-report evidence are kept.',
      'Remove the sample (demo) reports if you no longer need them for presentations.',
      'Upgrade: in MongoDB Atlas open your cluster → Edit configuration and move to a paid tier (Flex or M10). The connection string stays the same.',
    ],
  });

  // database transfer (rolling 7 days, photo/video traffic)
  const since = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const days = await Usage.find({ _id: { $gte: `db-${since}`, $lte: `db-${now.toISOString().slice(0, 10)}` } }).lean();
  const out7 = days.reduce((a, d) => a + (d.mediaOut || 0), 0) + pending.mediaOut;
  const transferLimit = L.dbTransferGbPerWeek * GB;
  items.push({
    key: 'db-transfer',
    label: 'Database data transfer (last 7 days)',
    plan: atlas ? `Atlas free – ${L.dbTransferGbPerWeek} GB out per rolling 7 days (estimate from photo/video traffic)` : 'Local database (no limit)',
    applies: atlas,
    used: out7,
    limit: transferLimit,
    unit: 'bytes',
    pct: atlas ? Math.round((out7 / transferLimit) * 1000) / 10 : 0,
    note: 'Over the limit Atlas only slows the database down; nothing is lost.',
    advice: ['It recovers by itself as old days drop out of the 7-day window.', 'Avoid replaying many videos; photos are much smaller.', 'Upgrade the Atlas cluster to a paid tier to remove the limit.'],
  });

  // Render hours & bandwidth (this month)
  const month = (await Usage.findById(monthKey()).lean()) || { awakeMinutes: 0, bytesOut: 0, requests: 0 };
  const hours = (month.awakeMinutes + (Date.now() - lastFlush) / 60000) / 60;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const resetOn = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  items.push({
    key: 'host-hours',
    label: 'Server running hours (this month)',
    plan: config.onRender ? `Render free web service – ${L.hostHoursPerMonth} hours per month` : 'Running on this computer (no limit)',
    applies: config.onRender,
    used: hours,
    limit: L.hostHoursPerMonth,
    unit: 'hours',
    pct: config.onRender ? Math.round((hours / L.hostHoursPerMonth) * 1000) / 10 : 0,
    note: `Counts only while the app is awake (Render puts it to sleep after 15 idle minutes). The 750 hours are shared by all free services in your Render workspace. Resets on ${resetOn}. A full month non-stop would be ${daysInMonth * 24} hours.`,
    advice: [
      'If the hours run out, Render pauses the app until the 1st of next month.',
      'Upgrade: in Render open the service → Settings → Instance type → Starter (about $7/month) to keep it running all month.',
      'Delete other free Render services you do not use – they share the same 750 hours.',
    ],
  });
  const bwLimit = L.hostBandwidthGbPerMonth * GB;
  const bw = month.bytesOut + pending.bytesOut;
  items.push({
    key: 'host-bandwidth',
    label: 'Server bandwidth (this month)',
    plan: config.onRender ? `Render free – ${L.hostBandwidthGbPerMonth} GB per month` : 'Running on this computer (no limit)',
    applies: config.onRender,
    used: bw,
    limit: bwLimit,
    unit: 'bytes',
    pct: config.onRender ? Math.round((bw / bwLimit) * 1000) / 10 : 0,
    note: `${(month.requests || 0).toLocaleString('en-IN')} requests this month. Resets on ${resetOn}.`,
    advice: ['Videos use the most bandwidth; free up space by removing old videos.', 'Upgrade the Render service to a paid instance for more bandwidth.'],
  });

  for (const it of items) it.level = it.applies ? levelOf(it.pct) : 'ok';
  const worst = items.reduce((w, it) => (RANK[it.level] > RANK[w] ? it.level : w), 'ok');
  const storageItem = items[0];
  const hostWorst = items.filter((i) => i.key.startsWith('host')).reduce((w, it) => (RANK[it.level] > RANK[w] ? it.level : w), 'ok');

  // What citizens see (only when it affects them)
  let publicNotice = '';
  if (storageItem.level === 'full') publicNotice = 'This app runs on a free plan and its storage is full, so new reports are paused for now. Please try again later or use the civic helpline 1533.';
  else if (storageItem.level === 'critical') publicNotice = 'This app runs on a free plan and its storage is almost full. Video uploads are paused; photos still work.';
  else if (RANK[hostWorst] >= RANK.critical) publicNotice = 'This app runs on a free hosting plan that is close to its monthly limit, so it may pause before the month ends.';

  cache = {
    freeTier: items.some((i) => i.applies),
    hosting: config.hosting,
    database: dbInfo.mode,
    level: worst,
    items,
    uploadsPaused: storageItem.applies && storageItem.level === 'full',
    videosPaused: storageItem.applies && RANK[storageItem.level] >= RANK.critical,
    publicNotice,
    checkedAt: new Date(),
  };
  cacheAt = Date.now();
  return cache;
}

// ---------------------------------------------------------------- alerting
// Writes an audit-log entry and a console warning the first time each limit reaches
// warning / critical / full in a given month, so the admin sees it even later.
async function checkAndAlert() {
  if (mongoose.connection.readyState !== 1) return;
  const st = await getUsageStatus({ fresh: true });
  const period = new Date().toISOString().slice(0, 7);
  const doc = (await Setting.findById('usage-alerts').lean()) || { values: {} };
  const sent = doc.values || {};
  let changed = false;
  for (const it of st.items) {
    if (!it.applies || it.level === 'ok') continue;
    const key = `${period}:${it.key}:${it.level}`;
    if (sent[key]) continue;
    sent[key] = new Date();
    changed = true;
    console.warn(`  ! FREE TIER ${it.level.toUpperCase()}: ${it.label} at ${it.pct}% of ${it.plan}`);
    await AuditLog.create({
      actorType: 'system',
      actorName: 'Usage monitor',
      actorRole: 'system',
      action: it.level === 'warning' ? 'FREE_TIER_WARNING' : 'FREE_TIER_CRITICAL',
      targetType: 'usage',
      targetId: it.key,
      details: { percent: it.pct, level: it.level, plan: it.plan },
    }).catch(() => {});
  }
  if (changed) await Setting.updateOne({ _id: 'usage-alerts' }, { $set: { values: sent } }, { upsert: true });
}
