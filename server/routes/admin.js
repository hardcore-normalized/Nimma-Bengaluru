// Administrator API: ward statistics, misuse watch-list, blocklist, audit log
// and anti-misuse settings. There is a single administrator account.
import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Report, Reporter, Block, AuditLog, Setting } from '../models/index.js';
import { WARDS, CORPORATIONS } from '../lib/wards.js';
import { OPEN_STATUSES } from '../lib/status.js';
import { parse, badRequest, notFound, escapeRegex, normalisePhone, maskPhone } from '../lib/http.js';
import { requireOfficial, requireAdmin } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { getSettings, updateSettings, SETTING_DEFS } from '../lib/settings.js';
import { trustScore } from '../lib/citizen.js';
import { getUsageStatus } from '../lib/usage.js';
import { firewallStatus, banIp, unbanIp } from '../lib/firewall.js';
import { deleteFile } from '../lib/media.js';
import { wipeDemoData } from '../seed/seed.js';
import { isIP } from 'node:net';

const router = express.Router();
router.use(requireOfficial, requireAdmin);

const oid = (s) => (mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(String(s)) : null);

// ------------------------------------------------------------------ areas (wards)
router.get('/areas', async (req, res) => {
  const totals = await Report.aggregate([
    { $group: { _id: '$area', total: { $sum: 1 }, open: { $sum: { $cond: [{ $in: ['$status', OPEN_STATUSES] }, 1, 0] } } } },
  ]);
  const t = Object.fromEntries(totals.map((x) => [x._id, x]));
  res.json({
    corporations: CORPORATIONS,
    wards: WARDS.map((w) => ({
      code: w.code,
      wardNo: w.wardNo,
      name: w.name,
      corporation: w.corporation,
      zone: w.zone,
      assembly: w.assembly,
      division: w.division,
      population: w.population,
      center: w.center,
      total: t[w.code]?.total || 0,
      open: t[w.code]?.open || 0,
    })),
  });
});

// ------------------------------------------------------------------ reporters (misuse watch-list)
router.get('/reporters', async (req, res) => {
  const q = parse(z.object({ filter: z.enum(['flagged', 'blocked', 'all']).optional().default('flagged'), q: z.string().max(60).optional(), page: z.coerce.number().int().min(1).max(500).optional().default(1) }), req.query);
  const filter = {};
  if (q.filter === 'flagged') filter.$or = [{ 'strikes.0': { $exists: true } }, { 'stats.rejected': { $gte: 2 } }];
  if (q.filter === 'blocked') {
    const phones = await Block.distinct('value', { type: 'phone', active: true, $or: [{ until: null }, { until: { $gt: new Date() } }] });
    filter.phone = { $in: phones };
  }
  if (q.q) {
    const digits = q.q.replace(/\D/g, '');
    filter.$and = [{ $or: [{ name: new RegExp(escapeRegex(q.q), 'i') }, ...(digits.length >= 3 ? [{ phone: new RegExp(escapeRegex(digits)) }] : [])] }];
  }
  const limit = 25;
  const [rows, total] = await Promise.all([Reporter.find(filter).sort({ lastSeenAt: -1 }).skip((q.page - 1) * limit).limit(limit).lean(), Reporter.countDocuments(filter)]);
  const phones = rows.map((r) => r.phone);
  const blocks = await Block.find({ type: 'phone', value: { $in: phones }, active: true, $or: [{ until: null }, { until: { $gt: new Date() } }] }).lean();
  res.json({
    total,
    page: q.page,
    pages: Math.ceil(total / limit),
    items: rows.map((r) => {
      const b = blocks.find((x) => x.value === r.phone);
      return {
        id: String(r._id),
        name: r.name,
        phone: r.phone,
        phoneMasked: maskPhone(r.phone),
        locality: r.locality,
        stats: r.stats,
        strikes: (r.strikes || []).filter((s) => !s.revoked).length,
        trust: trustScore(r),
        devices: (r.devices || []).length,
        namesUsed: (r.names || []).length,
        lastSeenAt: r.lastSeenAt,
        blocked: b ? { until: b.until, reason: b.reason } : null,
      };
    }),
  });
});

// ------------------------------------------------------------------ blocklist
router.get('/blocks', async (req, res) => {
  const active = req.query.active !== 'false';
  const now = new Date();
  const filter = active ? { active: true, $or: [{ until: null }, { until: { $gt: now } }] } : {};
  const rows = await Block.find(filter).sort({ createdAt: -1 }).limit(300).lean();
  const reporters = await Reporter.find({ _id: { $in: rows.map((r) => r.reporter).filter(Boolean) } }, { name: 1, phone: 1 }).lean();
  res.json({
    items: rows.map((b) => {
      const rep = reporters.find((r) => String(r._id) === String(b.reporter));
      return {
        id: String(b._id),
        type: b.type,
        value: b.value,
        reason: b.reason,
        until: b.until,
        permanent: !b.until,
        active: b.active && (!b.until || b.until > now),
        auto: b.auto,
        byName: b.byName,
        createdAt: b.createdAt,
        relatedRef: b.relatedRef,
        reporter: rep ? { id: String(rep._id), name: rep.name, phone: rep.phone } : null,
      };
    }),
  });
});

router.post('/blocks', async (req, res) => {
  const body = parse(
    z.object({
      type: z.enum(['phone', 'device', 'ip']),
      value: z.string().trim().min(3).max(80),
      days: z.coerce.number().int().min(-1).max(3650),
      reason: z.string().trim().min(5, 'Write a reason').max(300),
    }),
    req.body
  );
  let value = body.value;
  if (body.type === 'phone') {
    value = normalisePhone(body.value);
    if (!value) throw badRequest('Enter a valid 10-digit mobile number.');
  }
  if (body.days === 0) throw badRequest('Choose a duration.');
  const reporter = body.type === 'phone' ? await Reporter.findOne({ phone: value }) : null;
  await Block.updateMany({ type: body.type, value, active: true }, { $set: { active: false, liftedAt: new Date(), liftedBy: 'replaced' } });
  const b = await Block.create({
    type: body.type,
    value,
    reason: body.reason,
    reporter: reporter?._id,
    until: body.days === -1 ? null : new Date(Date.now() + body.days * 86400000),
    by: req.official._id,
    byName: req.official.name,
  });
  await audit(req, 'BLOCK_ADDED', { targetType: body.type, targetId: body.type === 'phone' ? maskPhone(value) : value.slice(0, 16), details: { days: body.days, reason: body.reason } });
  res.status(201).json({ id: String(b._id) });
});

router.delete('/blocks/:id', async (req, res) => {
  const b = oid(req.params.id) && (await Block.findById(req.params.id));
  if (!b) throw notFound('Block not found.');
  b.active = false;
  b.liftedAt = new Date();
  b.liftedBy = req.official.name;
  await b.save();
  await audit(req, 'BLOCK_REMOVED', { targetType: b.type, targetId: b.type === 'phone' ? maskPhone(b.value) : b.value.slice(0, 16) });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ audit log
router.get('/audit', async (req, res) => {
  const q = parse(
    z.object({
      action: z.string().max(40).optional(),
      actor: z.string().max(40).optional(),
      q: z.string().max(60).optional(),
      page: z.coerce.number().int().min(1).max(2000).optional().default(1),
    }),
    req.query
  );
  const filter = {};
  if (q.action) filter.action = q.action;
  if (q.actor && oid(q.actor)) filter.actorId = oid(q.actor);
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ targetRef: rx }, { actorName: rx }, { ip: rx }, { targetId: rx }];
  }
  const limit = 40;
  const [rows, total, actions] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((q.page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
    AuditLog.distinct('action'),
  ]);
  res.json({
    total,
    page: q.page,
    pages: Math.ceil(total / limit),
    actions: actions.sort(),
    items: rows.map((a) => ({
      id: String(a._id),
      at: a.at,
      action: a.action,
      actorName: a.actorName,
      actorRole: a.actorRole,
      targetType: a.targetType,
      targetId: a.targetId,
      targetRef: a.targetRef,
      details: a.details,
      ip: a.ip,
      ua: a.ua,
    })),
  });
});

// ------------------------------------------------------------------ settings
router.get('/settings', async (req, res) => {
  res.json({ values: await getSettings(), defs: SETTING_DEFS });
});

router.put('/settings', async (req, res) => {
  const before = await getSettings();
  const values = await updateSettings(req.body?.values || {});
  const changed = Object.keys(values).filter((k) => values[k] !== before[k]);
  await audit(req, 'SETTINGS_UPDATED', { targetType: 'settings', details: Object.fromEntries(changed.map((k) => [k, { from: before[k], to: values[k] }])) });
  res.json({ values, defs: SETTING_DEFS });
});

// ------------------------------------------------------------------ free-tier usage
router.get('/usage', async (req, res) => {
  res.json(await getUsageStatus({ fresh: req.query.fresh === '1' }));
});

// Free up database space: delete videos of complaints closed long ago. Photos stay, and
// videos of reports marked as fake are kept because they are misuse evidence.
router.post('/usage/cleanup-videos', async (req, res) => {
  const body = parse(z.object({ olderThanDays: z.coerce.number().int().min(0).max(3650).default(30) }), req.body || {});
  const cutoff = new Date(Date.now() - body.olderThanDays * 86400000);
  const reports = await Report.find({
    status: { $in: ['RESOLVED', 'REFERRED', 'DUPLICATE', 'REJECTED'] },
    closedAt: { $lte: cutoff },
    'media.kind': 'video',
  });
  let files = 0;
  let bytes = 0;
  for (const r of reports) {
    const videos = r.media.filter((m) => m.kind === 'video');
    for (const m of videos) {
      await deleteFile(m.fileId);
      files++;
      bytes += m.size || 0;
    }
    r.media = r.media.filter((m) => m.kind !== 'video');
    r.history.push({ from: r.status, to: r.status, reason: `${videos.length} video(s) removed to free database space (free plan).`, actorType: 'official', actorId: req.official._id, actorName: req.official.name, public: false });
    await r.save();
  }
  await audit(req, 'STORAGE_CLEANUP', { targetType: 'usage', details: { videos: files, mb: Math.round((bytes / 1048576) * 10) / 10, olderThanDays: body.olderThanDays } });
  res.json({ ok: true, videos: files, bytesFreed: bytes, reports: reports.length, usage: await getUsageStatus({ fresh: true }) });
});

router.post('/usage/remove-demo-data', async (req, res) => {
  await wipeDemoData();
  await Setting.updateOne({ _id: 'demo-removed' }, { $set: { values: { at: new Date(), by: req.official.name } } }, { upsert: true });
  await audit(req, 'DEMO_DATA_REMOVED', { targetType: 'usage' });
  res.json({ ok: true, usage: await getUsageStatus({ fresh: true }) });
});

// ------------------------------------------------------------------ firewall
router.get('/firewall', async (req, res) => {
  const s = await getSettings();
  res.json({ enabled: s.firewallEnabled, settings: { fwRequestsPerMinute: s.fwRequestsPerMinute, fwBanMinutes: s.fwBanMinutes }, yourIp: String(req.ip || '').replace(/^::ffff:/, ''), ...firewallStatus() });
});

router.post('/firewall/bans', async (req, res) => {
  const body = parse(z.object({ ip: z.string().trim().max(60), minutes: z.coerce.number().int().min(0).max(525600), reason: z.string().trim().min(3, 'Write a reason').max(200) }), req.body);
  if (!isIP(body.ip)) throw badRequest('Enter a valid IP address, e.g. 49.207.52.18');
  if (body.ip === String(req.ip || '').replace(/^::ffff:/, '')) throw badRequest('That is your own IP address – banning it would lock you out.');
  await banIp(body.ip, { minutes: body.minutes || null, reason: body.reason, byName: req.official.name });
  res.status(201).json({ ok: true });
});

router.delete('/firewall/bans/:ip', async (req, res) => {
  await unbanIp(String(req.params.ip));
  await audit(req, 'FIREWALL_UNBAN', { targetType: 'ip', targetId: String(req.params.ip) });
  res.json({ ok: true });
});

export default router;
