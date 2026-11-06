// Official portal API. Every route checks that the report / reporter is inside
// the signed-in official's assigned wards (and categories) – on the server.
import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Report, Reporter, Device, Official, Block } from '../models/index.js';
import { CATEGORIES, CATEGORY_GROUPS, CATEGORY_BY_CODE } from '../data/categories.js';
import { DEPARTMENTS, DEPARTMENT_BY_CODE } from '../data/departments.js';
import { WARDS, WARD_BY_CODE, wardFeatures, haversineM } from '../lib/wards.js';
import { STATUS, TRANSITIONS, OPEN_STATUSES, REASON_REQUIRED, canTransition } from '../lib/status.js';
import { parse, badRequest, notFound, forbidden, escapeRegex, maskPhone } from '../lib/http.js';
import { requireOfficial, requireAdmin, scopeFilter, canAccessReport } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { normaliseReference } from '../lib/refno.js';
import { sniffMime, sha256, dhash, saveFile, IMAGE_TYPES, MAX_IMAGE_BYTES } from '../lib/media.js';
import { blockReporter, applyAutoBlock, liftBlocksForReporter, findActiveBlock, blockPayload } from '../lib/blocks.js';
import { trustScore, categoryInfo } from '../lib/citizen.js';
import { sendSms } from '../lib/sms.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 4, fields: 12, fieldSize: 16 * 1024 } });
const DAY = 86400000;
router.use(requireOfficial);

const isAdmin = (o) => o.role === 'admin';
const oid = (s) => (mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(String(s)) : null);

function deptOf(code) {
  return DEPARTMENT_BY_CODE[code] || null;
}

async function loadReport(req) {
  const ref = normaliseReference(req.params.ref);
  if (!ref) throw badRequest('Invalid reference number.');
  const r = await Report.findOne({ ref });
  if (!r) throw notFound('Report not found.');
  if (!canAccessReport(req.official, r)) {
    await audit(req, 'ACCESS_DENIED', { targetType: 'report', targetId: r._id, targetRef: r.ref, details: { area: r.area, category: r.category, sensitive: r.sensitive } });
    throw forbidden(r.sensitive ? 'This is a confidential report. You are not authorised to view it.' : `Report ${r.ref} is outside your assigned area. This attempt has been logged.`);
  }
  return r;
}

function listView(r) {
  const st = STATUS[r.status] || {};
  const img = (r.media || []).find((m) => m.kind === 'image' && m.role === 'evidence');
  return {
    ref: r.ref,
    category: categoryInfo(r.category),
    status: r.status,
    statusLabel: st.label,
    severity: r.severity,
    hazard: r.hazard,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    area: r.area,
    areaName: r.areaName,
    corporation: r.corporation,
    zone: r.zone,
    landmark: r.landmark || '',
    description: (r.description || '').slice(0, 140),
    risk: { score: r.risk?.score || 0, level: r.risk?.level || 'low' },
    supportCount: r.supportCount || 0,
    slaDueAt: r.slaDueAt,
    overdue: Boolean(!st.closed && r.slaDueAt && new Date(r.slaDueAt) < new Date()),
    thumb: img ? String(img.fileId) : null,
    reporterName: r.reporterSnapshot?.name || '',
    department: r.assignment?.department ? deptOf(r.assignment.department)?.short : null,
    possibleDuplicate: (r.possibleDuplicates || []).length > 0,
    sensitive: Boolean(r.sensitive),
    lat: r.location?.coordinates?.[1],
    lng: r.location?.coordinates?.[0],
  };
}

// ------------------------------------------------------------------ meta
router.get('/meta', async (req, res) => {
  const o = req.official;
  const wards = isAdmin(o) ? WARDS : WARDS.filter((w) => o.areas.includes(w.code));
  const cats = CATEGORIES.filter((c) => (!o.categories?.length || o.categories.includes(c.code)) && (!c.sensitive || isAdmin(o) || o.canViewSensitive));
  res.json({
    me: o.toSafeJSON(),
    categories: cats.map((c) => ({ code: c.code, group: c.group, name: c.name, emoji: c.emoji, dept: c.dept, slaDays: c.slaDays, sensitive: Boolean(c.sensitive) })),
    groups: CATEGORY_GROUPS.map(({ code, name }) => ({ code, name })),
    departments: DEPARTMENTS,
    statuses: Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, { label: v.label, publicLabel: v.publicLabel, closed: v.closed }])),
    transitions: TRANSITIONS,
    reasonRequired: [...REASON_REQUIRED],
    wards: wards.map((w) => ({ code: w.code, name: w.name, corporation: w.corporation, zone: w.zone, center: w.center })),
  });
});

router.get('/wards-geo', (req, res) => {
  const o = req.official;
  res.set('Cache-Control', 'private, max-age=600');
  res.json(wardFeatures(isAdmin(o) ? null : o.areas));
});

// ------------------------------------------------------------------ dashboard
router.get('/dashboard', async (req, res) => {
  const f = scopeFilter(req.official);
  const now = new Date();
  const d14 = new Date(now.getTime() - 13 * DAY);
  d14.setHours(0, 0, 0, 0);
  const tz = 'Asia/Kolkata';
  const [byStatus, byCategory, created, resolved, overdue, highRisk, byWard, recent, avgRes, spamCaught, hazards] = await Promise.all([
    Report.aggregate([{ $match: f }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Report.aggregate([{ $match: { ...f, status: { $ne: 'SPAM' } } }, { $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
    Report.aggregate([{ $match: { ...f, createdAt: { $gte: d14 } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, n: { $sum: 1 } } }]),
    Report.aggregate([{ $match: { ...f, status: 'RESOLVED', closedAt: { $gte: d14 } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$closedAt', timezone: tz } }, n: { $sum: 1 } } }]),
    Report.countDocuments({ ...f, status: { $in: OPEN_STATUSES }, slaDueAt: { $lt: now } }),
    Report.countDocuments({ ...f, status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'] }, 'risk.level': 'high' }),
    Report.aggregate([
      { $match: f },
      { $group: { _id: '$area', name: { $first: '$areaName' }, n: { $sum: 1 }, open: { $sum: { $cond: [{ $in: ['$status', OPEN_STATUSES] }, 1, 0] } } } },
      { $sort: { open: -1, n: -1 } },
      { $limit: 8 },
    ]),
    Report.find(f).sort({ createdAt: -1 }).limit(8).lean(),
    Report.aggregate([{ $match: { ...f, status: 'RESOLVED', closedAt: { $exists: true } } }, { $group: { _id: null, avg: { $avg: { $subtract: ['$closedAt', '$createdAt'] } } } }]),
    Report.countDocuments({ ...f, status: 'SPAM' }),
    Report.countDocuments({ ...f, status: { $in: OPEN_STATUSES }, $or: [{ hazard: true }, { severity: 'critical' }] }),
  ]);
  const counts = Object.fromEntries(byStatus.map((x) => [x._id, x.n]));
  const sum = (keys) => keys.reduce((a, k) => a + (counts[k] || 0), 0);
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(d14.getTime() + i * DAY);
    const key = d.toLocaleDateString('en-CA', { timeZone: tz });
    days.push({ date: key, created: created.find((x) => x._id === key)?.n || 0, resolved: resolved.find((x) => x._id === key)?.n || 0 });
  }
  res.json({
    scope: isAdmin(req.official) ? 'All 369 wards' : `${req.official.areas.length} assigned wards`,
    kpis: {
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      newReports: sum(['SUBMITTED', 'RESUBMITTED']),
      underReview: sum(['UNDER_REVIEW', 'NEEDS_CORRECTION']),
      inProgress: sum(['ASSIGNED', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'REOPENED']),
      resolved: counts.RESOLVED || 0,
      closedOther: sum(['REFERRED', 'DUPLICATE', 'REJECTED']),
      spam: spamCaught,
      overdue,
      highRisk,
      hazards,
      avgResolutionDays: avgRes[0] ? Math.round((avgRes[0].avg / DAY) * 10) / 10 : null,
    },
    byStatus: counts,
    byCategory: byCategory.map((x) => ({ ...categoryInfo(x._id), n: x.n })),
    trend: days,
    byWard: byWard.map((w) => ({ code: w._id, name: w.name, total: w.n, open: w.open })),
    recent: recent.map(listView),
  });
});

// ------------------------------------------------------------------ report list
router.get('/reports', async (req, res) => {
  const q = parse(
    z.object({
      status: z.string().max(200).optional(),
      category: z.string().max(40).optional(),
      area: z.string().max(10).optional(),
      risk: z.enum(['low', 'medium', 'high']).optional(),
      q: z.string().max(80).optional(),
      sort: z.enum(['new', 'old', 'risk', 'sla', 'support']).optional().default('new'),
      flag: z.enum(['overdue', 'hazard', 'duplicate', 'sensitive']).optional(),
      page: z.coerce.number().int().min(1).max(1000).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),
    req.query
  );
  const o = req.official;
  const filter = { ...scopeFilter(o) };
  if (q.status && q.status !== 'all') {
    const list = q.status === 'open' ? OPEN_STATUSES : q.status === 'closed' ? Object.keys(STATUS).filter((s) => STATUS[s].closed) : q.status.split(',').filter((s) => STATUS[s]);
    filter.status = { $in: list };
  }
  if (q.category) {
    if (o.categories?.length && !o.categories.includes(q.category)) return res.json({ items: [], total: 0, page: 1, pages: 0 });
    filter.category = q.category;
  }
  if (q.area) {
    if (!isAdmin(o) && !o.areas.includes(q.area)) return res.json({ items: [], total: 0, page: 1, pages: 0 });
    filter.area = q.area;
  }
  if (q.risk) filter['risk.level'] = q.risk;
  if (q.flag === 'overdue') {
    filter.status = { $in: OPEN_STATUSES };
    filter.slaDueAt = { $lt: new Date() };
  }
  if (q.flag === 'hazard') filter.$or = [{ hazard: true }, { severity: 'critical' }];
  if (q.flag === 'duplicate') filter['possibleDuplicates.0'] = { $exists: true };
  if (q.flag === 'sensitive') filter.sensitive = true;
  if (q.q) {
    const ref = normaliseReference(q.q);
    if (ref) filter.ref = ref;
    else {
      const rx = new RegExp(escapeRegex(q.q.trim()), 'i');
      filter.$and = [{ $or: [{ description: rx }, { landmark: rx }, { areaName: rx }, { 'reporterSnapshot.name': rx }, { ref: rx }] }];
    }
  }
  const sort = { new: { createdAt: -1 }, old: { createdAt: 1 }, risk: { 'risk.score': -1, createdAt: -1 }, sla: { slaDueAt: 1 }, support: { supportCount: -1, createdAt: -1 } }[q.sort];
  const [items, total] = await Promise.all([
    Report.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Report.countDocuments(filter),
  ]);
  res.json({ items: items.map(listView), total, page: q.page, pages: Math.ceil(total / q.limit) });
});

// ------------------------------------------------------------------ map points
router.get('/map', async (req, res) => {
  const f = scopeFilter(req.official);
  const status = String(req.query.status || 'open');
  if (status === 'open') f.status = { $in: OPEN_STATUSES };
  const rows = await Report.find(f, { ref: 1, category: 1, status: 1, location: 1, createdAt: 1, areaName: 1, 'risk.level': 1, severity: 1, hazard: 1, slaDueAt: 1 })
    .sort({ createdAt: -1 })
    .limit(2000)
    .lean();
  res.json({
    items: rows.map((r) => ({
      ref: r.ref,
      category: r.category,
      status: r.status,
      lat: r.location.coordinates[1],
      lng: r.location.coordinates[0],
      createdAt: r.createdAt,
      areaName: r.areaName,
      risk: r.risk?.level || 'low',
      severity: r.severity,
      hazard: r.hazard,
      overdue: Boolean(!STATUS[r.status]?.closed && r.slaDueAt && new Date(r.slaDueAt) < new Date()),
    })),
  });
});

// ------------------------------------------------------------------ report detail
async function detailView(r, official) {
  const reporter = r.reporter ? await Reporter.findById(r.reporter).lean() : null;
  const block = reporter ? await findActiveBlock({ phone: reporter.phone }) : null;
  const dev = r.client?.deviceId ? await Device.findOne({ deviceId: r.client.deviceId }, { phones: 1 }).lean() : null;
  const scope = scopeFilter(official);
  const [sameDevice, sameReporter, dupRows] = await Promise.all([
    r.client?.deviceId
      ? Report.find({ 'client.deviceId': r.client.deviceId, _id: { $ne: r._id } }, { ref: 1, status: 1, category: 1, createdAt: 1, reporter: 1 }).sort({ createdAt: -1 }).limit(10).lean()
      : [],
    r.reporter ? Report.find({ reporter: r.reporter, _id: { $ne: r._id } }, { ref: 1, status: 1, category: 1, createdAt: 1, area: 1 }).sort({ createdAt: -1 }).limit(10).lean() : [],
    (r.possibleDuplicates || []).length ? Report.find({ ref: { $in: r.possibleDuplicates }, ...scope }, { ref: 1, status: 1, createdAt: 1, supportCount: 1, location: 1 }).lean() : [],
  ]);
  const lat = r.location.coordinates[1];
  const lng = r.location.coordinates[0];
  const ward = WARD_BY_CODE[r.area];
  const cat = CATEGORY_BY_CODE[r.category];
  const st = STATUS[r.status];
  const allowed = [...(TRANSITIONS[r.status] || [])].filter((s) => s !== 'ASSIGNED');
  if (r.status === 'SPAM' && isAdmin(official)) allowed.push('UNDER_REVIEW');
  const phones = new Set((dev?.phones || []).map((p) => p.phone));
  return {
    ref: r.ref,
    category: { ...categoryInfo(r.category), dept: cat?.dept, deptName: deptOf(cat?.dept)?.name, slaDays: cat?.slaDays },
    description: r.description,
    severity: r.severity,
    hazard: r.hazard,
    status: r.status,
    statusLabel: st?.label,
    closed: Boolean(st?.closed),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    slaDueAt: r.slaDueAt,
    overdue: Boolean(!st?.closed && r.slaDueAt && new Date(r.slaDueAt) < new Date()),
    closedAt: r.closedAt,
    location: { lat, lng, accuracy: r.locationAccuracy, source: r.locationSource },
    landmark: r.landmark,
    address: r.address,
    area: { code: r.area, name: r.areaName, corporation: r.corporation, zone: r.zone, assembly: ward?.assembly },
    media: (r.media || []).map((m) => ({
      id: String(m.fileId),
      kind: m.kind,
      mime: m.mime,
      size: m.size,
      role: m.role,
      captureMethod: m.captureMethod,
      capturedAt: m.capturedAt,
      gps: m.gps,
      exifDate: m.exifDate,
      width: m.width,
      height: m.height,
      durationSec: m.durationSec,
      uploadedBy: m.uploadedBy,
      uploadedAt: m.uploadedAt,
      sha256: m.sha256 ? m.sha256.slice(0, 16) : null,
    })),
    history: (r.history || []).map((h) => ({ from: h.from, to: h.to, reason: h.reason, actorType: h.actorType, actorName: h.actorName, at: h.at, public: h.public !== false })),
    notes: (r.notes || []).map((n) => ({ text: n.text, byName: n.byName, at: n.at })),
    assignment: r.assignment ? { ...r.assignment, departmentName: deptOf(r.assignment.department)?.name } : null,
    assignments: (r.assignments || []).map((a) => ({ ...a, departmentName: deptOf(a.department)?.name })),
    resolution: r.resolution || null,
    duplicateOf: r.duplicateOf || null,
    possibleDuplicates: dupRows.map((d) => ({
      ref: d.ref,
      status: d.status,
      createdAt: d.createdAt,
      supportCount: d.supportCount || 0,
      distanceM: Math.round(haversineM(lat, lng, d.location.coordinates[1], d.location.coordinates[0])),
    })),
    supportCount: r.supportCount || 0,
    sensitive: Boolean(r.sensitive),
    risk: r.risk || { score: 0, level: 'low', signals: [] },
    spam: r.spam?.at ? r.spam : null,
    correctionRequest: r.correctionRequest?.at ? r.correctionRequest : null,
    citizenResponses: (r.citizenResponses || []).map((c) => ({ text: c.text, at: c.at, mediaIds: (c.mediaIds || []).map(String) })),
    reopenRequests: r.reopenRequests || [],
    client: {
      ...(r.client || {}),
      deviceShort: r.client?.deviceId ? r.client.deviceId.slice(0, 8) : null,
    },
    reporter: reporter
      ? {
          id: String(reporter._id),
          name: r.reporterSnapshot?.name || reporter.name,
          phoneMasked: maskPhone(reporter.phone),
          locality: r.reporterSnapshot?.locality || reporter.locality,
          trust: trustScore(reporter),
          strikes: (reporter.strikes || []).filter((s) => !s.revoked).length,
          stats: reporter.stats,
          firstSeenAt: reporter.firstSeenAt,
          blocked: block ? blockPayload(block) : null,
          numbersOnThisDevice: phones.size,
          devices: (reporter.devices || []).length,
          namesUsed: reporter.names || [],
        }
      : null,
    related: {
      sameDevice: sameDevice.map((x) => ({ ref: x.ref, status: x.status, category: x.category, createdAt: x.createdAt, otherNumber: String(x.reporter) !== String(r.reporter) })),
      sameReporter: sameReporter.map((x) => ({ ref: x.ref, status: x.status, category: x.category, createdAt: x.createdAt, inScope: isAdmin(official) || official.areas.includes(x.area) })),
    },
    allowedTransitions: allowed,
    isDemo: r.isDemo,
  };
}

router.get('/reports/:ref', async (req, res) => {
  const r = await loadReport(req);
  // Opening a new report moves it to "Under review" automatically
  if (r.status === 'SUBMITTED' || r.status === 'RESUBMITTED') {
    const prev = r.status;
    r.history.push({ from: prev, to: 'UNDER_REVIEW', reason: 'Opened for review', actorType: 'official', actorId: req.official._id, actorName: req.official.name, public: true });
    r.status = 'UNDER_REVIEW';
    await r.save();
  }
  await audit(req, 'REPORT_VIEWED', { targetType: 'report', targetId: r._id, targetRef: r.ref });
  res.json({ report: await detailView(r.toObject(), req.official) });
});

// ------------------------------------------------------------------ status change
const statusBody = z.object({
  to: z.string().max(40),
  reason: z.string().trim().max(1000).optional().default(''),
  duplicateOf: z.string().max(20).optional(),
  blockDays: z.coerce.number().int().min(-1).max(365).optional().default(0), // -1 = permanent, 0 = no block
  blockDevices: z.union([z.boolean(), z.string()]).optional(),
});

router.post('/reports/:ref/status', upload.array('media', 4), async (req, res) => {
  const r = await loadReport(req);
  const o = req.official;
  const body = parse(statusBody, req.body || {});
  const to = body.to;
  if (!STATUS[to]) throw badRequest('Unknown status.');
  if (to === 'ASSIGNED') throw badRequest('Use "Assign" to assign a report to a department.');
  const reversal = r.status === 'SPAM' && to === 'UNDER_REVIEW';
  if (reversal && !isAdmin(o)) throw forbidden('Only the administrator can reverse a misuse decision.');
  if (!reversal && !canTransition(r.status, to)) throw badRequest(`A report cannot move from "${STATUS[r.status].label}" to "${STATUS[to].label}".`);
  if ((REASON_REQUIRED.has(to) || reversal) && body.reason.length < 5) throw badRequest('Please write a short reason (at least 5 characters).');
  if (to === 'SPAM' && body.blockDays === -1 && !isAdmin(o)) throw forbidden('Only the administrator can block permanently.');
  if (to === 'SPAM' && body.blockDays > 90 && !isAdmin(o)) throw forbidden('Officials can block for at most 90 days.');

  // Optional photos uploaded by the official (progress / resolution evidence)
  const newMedia = [];
  for (const [i, f] of (req.files || []).entries()) {
    const mime = sniffMime(f.buffer);
    if (!IMAGE_TYPES.has(mime)) throw badRequest(`File ${i + 1} is not a supported image.`);
    const role = ['RESOLVED', 'AWAITING_VERIFICATION'].includes(to) ? 'resolution' : 'progress';
    const sha = sha256(f.buffer);
    const fileId = await saveFile(f.buffer, { filename: `${r.ref}-${role}-${Date.now()}-${i}`, contentType: mime, metadata: { ref: r.ref, role, sha256: sha, by: String(o._id) } });
    newMedia.push({ fileId, kind: 'image', mime, size: f.size, sha256: sha, phash: mime === 'image/jpeg' ? dhash(f.buffer)?.hash : undefined, role, captureMethod: 'official', uploadedBy: o.name, uploadedAt: new Date() });
  }
  r.media.push(...newMedia);

  const reporter = r.reporter ? await Reporter.findById(r.reporter) : null;
  const from = r.status;
  let extra = {};

  if (to === 'RESOLVED') {
    const lastReopen = [...r.history].reverse().find((h) => h.to === 'REOPENED');
    const since = lastReopen ? new Date(lastReopen.at) : new Date(0);
    const evidence = r.media.filter((m) => m.role === 'resolution' && new Date(m.uploadedAt || 0) >= since);
    if (!evidence.length) throw badRequest('Upload at least one "after" photo as resolution evidence before marking the report resolved.');
    r.resolution = { note: body.reason, at: new Date(), by: o._id, byName: o.name };
    r.closedAt = new Date();
    if (reporter) reporter.stats.resolved = (reporter.stats.resolved || 0) + 1;
  }
  if (to === 'NEEDS_CORRECTION') r.correctionRequest = { message: body.reason, byName: o.name, at: new Date() };
  if (to === 'DUPLICATE') {
    const dref = normaliseReference(body.duplicateOf);
    if (!dref || dref === r.ref) throw badRequest('Enter the reference number of the original report.');
    const orig = await Report.findOne({ ref: dref });
    if (!orig || !canAccessReport(o, orig)) throw badRequest('Original report not found in your area.');
    r.duplicateOf = dref;
    if (r.reporter && !orig.supporters.some((x) => String(x.reporter) === String(r.reporter)) && String(orig.reporter) !== String(r.reporter)) {
      orig.supporters.push({ reporter: r.reporter, at: new Date() });
      orig.supportCount = orig.supporters.length;
      await orig.save();
    }
    if (reporter) reporter.stats.duplicates = (reporter.stats.duplicates || 0) + 1;
  }
  if (to === 'REJECTED' && reporter) reporter.stats.rejected = (reporter.stats.rejected || 0) + 1;
  if (to === 'REOPENED') r.closedAt = undefined;
  if (['REFERRED', 'DUPLICATE', 'REJECTED', 'SPAM'].includes(to)) r.closedAt = new Date();

  if (to === 'SPAM') {
    // Misuse: strike against the reporter + optional / automatic block
    r.spam = { reason: body.reason, by: o._id, byName: o.name, at: new Date() };
    if (reporter) {
      reporter.strikes.push({ report: r._id, ref: r.ref, reason: body.reason, by: o._id, byName: o.name, at: new Date() });
      reporter.stats.spam = (reporter.stats.spam || 0) + 1;
    }
  }
  if (reversal) {
    r.spam = undefined;
    r.closedAt = undefined;
    if (reporter) {
      for (const s of reporter.strikes) if (String(s.report) === String(r._id)) s.revoked = true;
      reporter.stats.spam = Math.max(0, (reporter.stats.spam || 0) - 1);
    }
  }

  r.history.push({ from, to, reason: body.reason || STATUS[to].label, actorType: 'official', actorId: o._id, actorName: o.name, public: true });
  r.status = to;
  await r.save();
  if (reporter) await reporter.save();

  if (to === 'SPAM' && reporter) {
    const deviceIds = [r.client?.deviceId];
    const fps = [r.client?.fpHash];
    const wantDevices = body.blockDevices === true || body.blockDevices === 'true';
    if (body.blockDays !== 0) {
      const bl = await blockReporter({
        reporter,
        deviceIds: wantDevices ? (reporter.devices || []).map((d) => d.deviceId).concat(deviceIds) : deviceIds,
        fpHashes: wantDevices ? fps : [],
        days: body.blockDays === -1 ? null : body.blockDays,
        reason: `Fake / misuse report ${r.ref}: ${body.reason}`,
        relatedRef: r.ref,
        by: o,
      });
      extra.blocked = { until: bl.until, manual: true };
      await audit(req, 'REPORTER_BLOCKED', { targetType: 'reporter', targetId: reporter._id, targetRef: r.ref, details: { days: body.blockDays, devices: wantDevices } });
    } else {
      const auto = await applyAutoBlock(reporter, { deviceIds, fpHashes: fps, relatedRef: r.ref });
      if (auto) {
        extra.blocked = { until: auto.until, automatic: true };
        await audit(req, 'REPORTER_AUTO_BLOCKED', { targetType: 'reporter', targetId: reporter._id, targetRef: r.ref, details: { until: auto.until } });
      }
    }
    if (!reporter.isDemo) sendSms(reporter.phone, `Nimma Bengaluru: report ${r.ref} was marked for misuse after reviewer assessment. Contact the portal administrator if you believe this was recorded incorrectly.`).catch(() => {});
  }

  await audit(req, to === 'SPAM' ? 'MARKED_SPAM' : reversal ? 'SPAM_REVERSED' : 'STATUS_CHANGED', {
    targetType: 'report',
    targetId: r._id,
    targetRef: r.ref,
    details: { from, to, reason: body.reason.slice(0, 300), photos: newMedia.length },
  });
  if (reporter && !reporter.isDemo && ['NEEDS_CORRECTION', 'IN_PROGRESS', 'RESOLVED', 'REFERRED', 'REJECTED', 'DUPLICATE'].includes(to)) {
    sendSms(reporter.phone, `Nimma Bengaluru: report ${r.ref} is now "${STATUS[to].publicLabel}".`).catch(() => {});
  }
  res.json({ report: await detailView(r.toObject(), o), ...extra });
});

// ------------------------------------------------------------------ assignment
router.post('/reports/:ref/assign', async (req, res) => {
  const r = await loadReport(req);
  const o = req.official;
  const body = parse(
    z.object({
      department: z.string().max(20),
      team: z.string().trim().max(120).optional().default(''),
      officialId: z.string().max(40).optional().default(''),
      dueAt: z.string().max(40).optional().default(''),
      note: z.string().trim().max(500).optional().default(''),
    }),
    req.body
  );
  if (!DEPARTMENT_BY_CODE[body.department]) throw badRequest('Choose a department.');
  if (!['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'REOPENED', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status)) {
    throw badRequest(`A report that is "${STATUS[r.status].label}" cannot be assigned.`);
  }
  let assignee = null;
  if (body.officialId) {
    const id = oid(body.officialId);
    assignee = id ? await Official.findOne({ _id: id, active: true }) : null;
    if (!assignee) throw badRequest('Selected official not found.');
    if (assignee.role !== 'admin' && !assignee.areas.includes(r.area)) throw badRequest(`${assignee.name} does not cover ward ${r.areaName}.`);
  }
  const due = body.dueAt ? new Date(body.dueAt) : null;
  if (due && Number.isNaN(due.getTime())) throw badRequest('Invalid due date.');
  const a = {
    department: body.department,
    team: body.team,
    official: assignee?._id,
    officialName: assignee?.name,
    dueAt: due || r.slaDueAt,
    note: body.note,
    by: o._id,
    byName: o.name,
    at: new Date(),
  };
  r.assignment = a;
  r.assignments.push(a);
  if (due) r.slaDueAt = due;
  const from = r.status;
  const dept = DEPARTMENT_BY_CODE[body.department];
  r.history.push({
    from,
    to: 'ASSIGNED',
    reason: `Assigned to ${dept.name}${body.team ? ' – ' + body.team : ''}${assignee ? ' (' + assignee.name + ')' : ''}${body.note ? '. ' + body.note : ''}`,
    actorType: 'official',
    actorId: o._id,
    actorName: o.name,
    public: true,
  });
  r.status = 'ASSIGNED';
  await r.save();
  await audit(req, 'ASSIGNED', { targetType: 'report', targetId: r._id, targetRef: r.ref, details: { from, department: body.department, team: body.team, official: assignee?.name } });
  res.json({ report: await detailView(r.toObject(), o) });
});

router.post('/reports/:ref/notes', async (req, res) => {
  const r = await loadReport(req);
  const body = parse(z.object({ text: z.string().trim().min(2).max(1000) }), req.body);
  r.notes.push({ text: body.text, by: req.official._id, byName: req.official.name, at: new Date() });
  await r.save();
  await audit(req, 'NOTE_ADDED', { targetType: 'report', targetId: r._id, targetRef: r.ref });
  res.json({ report: await detailView(r.toObject(), req.official) });
});

router.post('/reports/:ref/reveal-contact', async (req, res) => {
  const r = await loadReport(req);
  const reporter = r.reporter ? await Reporter.findById(r.reporter).lean() : null;
  if (!reporter) throw notFound('No reporter on this record.');
  await audit(req, 'CONTACT_REVEALED', { targetType: 'reporter', targetId: reporter._id, targetRef: r.ref });
  res.json({ phone: reporter.phone, name: r.reporterSnapshot?.name || reporter.name, locality: r.reporterSnapshot?.locality || reporter.locality });
});

// ------------------------------------------------------------------ reporter dossier (misuse investigation)
async function loadReporterInScope(req) {
  const id = oid(req.params.id);
  if (!id) throw badRequest('Invalid reporter id.');
  const reporter = await Reporter.findById(id);
  if (!reporter) throw notFound('Reporter not found.');
  const o = req.official;
  if (!isAdmin(o)) {
    const inScope = await Report.exists({ reporter: id, ...scopeFilter(o) });
    if (!inScope) {
      await audit(req, 'ACCESS_DENIED', { targetType: 'reporter', targetId: id, details: { reason: 'no report in assigned area' } });
      throw forbidden('This reporter has no reports in your assigned area.');
    }
  }
  return reporter;
}

router.get('/reporters/:id', async (req, res) => {
  const reporter = await loadReporterInScope(req);
  const o = req.official;
  const purpose = req.query.purpose === 'evidence' ? 'evidence' : 'dossier';
  const deviceIds = (reporter.devices || []).map((d) => d.deviceId);
  const [reports, devices, blocks] = await Promise.all([
    Report.find({ reporter: reporter._id }).sort({ createdAt: -1 }).limit(200).lean(),
    Device.find({ deviceId: { $in: deviceIds } }).lean(),
    Block.find({ $or: [{ reporter: reporter._id }, { type: 'phone', value: reporter.phone }] }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  // Other mobile numbers used on the same phones (possible fake identities)
  const linkedPhones = new Set();
  for (const d of devices) for (const p of d.phones || []) if (p.phone !== reporter.phone) linkedPhones.add(p.phone);
  const fps = [...new Set((reporter.devices || []).map((d) => d.fpHash).filter(Boolean))];
  if (fps.length) {
    const fpDevices = await Device.find({ fpHash: { $in: fps } }, { phones: 1 }).limit(100).lean();
    for (const d of fpDevices) for (const p of d.phones || []) if (p.phone !== reporter.phone) linkedPhones.add(p.phone);
  }
  const linked = linkedPhones.size ? await Reporter.find({ phone: { $in: [...linkedPhones] } }, { phone: 1, name: 1, strikes: 1, stats: 1 }).lean() : [];
  const activeBlock = await findActiveBlock({ phone: reporter.phone });
  const inScope = (r) => isAdmin(o) || ((o.areas || []).includes(r.area) && (!r.sensitive || o.canViewSensitive) && (!o.categories?.length || o.categories.includes(r.category)));

  await audit(req, purpose === 'evidence' ? 'EVIDENCE_EXPORTED' : 'DOSSIER_VIEWED', { targetType: 'reporter', targetId: reporter._id, details: { reports: reports.length } });
  res.json({
    generatedAt: new Date(),
    generatedBy: { name: o.name, designation: o.designation, role: o.role },
    reporter: {
      id: String(reporter._id),
      phone: reporter.phone,
      name: reporter.name,
      namesUsed: reporter.names || [],
      locality: reporter.locality,
      localitiesUsed: reporter.localities || [],
      firstSeenAt: reporter.firstSeenAt,
      lastSeenAt: reporter.lastSeenAt,
      stats: reporter.stats,
      trust: trustScore(reporter),
      strikes: (reporter.strikes || []).map((s) => ({ id: String(s._id), ref: s.ref, reason: s.reason, byName: s.byName, at: s.at, revoked: s.revoked })),
      blocked: activeBlock ? blockPayload(activeBlock) : null,
    },
    contactClaims: (reporter.contactClaims || []).slice().reverse(),
    devices: (reporter.devices || []).map((d) => {
      const doc = devices.find((x) => x.deviceId === d.deviceId);
      return {
        deviceId: d.deviceId,
        fpHash: d.fpHash,
        ua: d.ua,
        platform: d.platform,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
        otherNumbers: (doc?.phones || []).filter((p) => p.phone !== reporter.phone).map((p) => p.phone),
        ips: (doc?.ips || []).map((i) => i.ip),
        fp: doc?.fp || null,
      };
    }),
    ips: reporter.ips || [],
    linkedIdentities: linked.map((l) => ({ id: String(l._id), phone: l.phone, name: l.name, strikes: (l.strikes || []).filter((s) => !s.revoked).length, reports: l.stats?.reports || 0 })),
    blocks: blocks.map((b) => ({ type: b.type, value: b.type === 'phone' ? b.value : b.value.slice(0, 12) + '…', reason: b.reason, until: b.until, active: b.active, auto: b.auto, byName: b.byName, at: b.createdAt, liftedAt: b.liftedAt })),
    reports: reports.map((r) => {
      const visible = inScope(r);
      const base = { ref: r.ref, category: categoryInfo(r.category), status: r.status, statusLabel: STATUS[r.status]?.label, createdAt: r.createdAt, areaName: r.areaName, inScope: visible };
      if (!visible) return base;
      return {
        ...base,
        description: r.description,
        risk: r.risk,
        spam: r.spam?.at ? r.spam : null,
        ip: r.client?.ip,
        deviceId: r.client?.deviceId,
        ua: r.client?.ua,
        distanceToIssueM: r.client?.distanceToIssueM,
        deviceLocation: r.client?.deviceLocation,
        location: { lat: r.location.coordinates[1], lng: r.location.coordinates[0] },
        media: (r.media || []).filter((m) => m.role === 'evidence').map((m) => ({ id: String(m.fileId), kind: m.kind, captureMethod: m.captureMethod, capturedAt: m.capturedAt, sha256: m.sha256 })),
      };
    }),
    legal: [
      'This bundle is a technical record for authorised human review. Contact details are self-reported and unverified. Device identifiers, IP addresses, GPS and photo hashes may be inaccurate, shared or spoofed and do not establish a person’s identity, intent or guilt.',
      'Review the original report and supporting records, record the basis for any moderation decision, and follow the institution’s approved process. This portal does not determine guilt or impose a legal penalty. Any referral to a competent authority is a human decision.',
      'Recorded fields may include the self-reported mobile number and name, device identifiers, IP addresses, GPS position at submission, timestamps and photo hashes.',
    ],
  });
});

router.post('/reporters/:id/block', async (req, res) => {
  const reporter = await loadReporterInScope(req);
  const o = req.official;
  const body = parse(
    z.object({ days: z.coerce.number().int().min(-1).max(365), reason: z.string().trim().min(5, 'Write a reason (at least 5 characters)').max(300), includeDevices: z.boolean().optional().default(true) }),
    req.body
  );
  if (body.days === 0) throw badRequest('Choose a block duration.');
  if (body.days === -1 && !isAdmin(o)) throw forbidden('Only the administrator can block permanently.');
  if (body.days > 90 && !isAdmin(o)) throw forbidden('Officials can block for at most 90 days.');
  const bl = await blockReporter({
    reporter,
    deviceIds: body.includeDevices ? (reporter.devices || []).map((d) => d.deviceId) : [],
    fpHashes: body.includeDevices ? (reporter.devices || []).map((d) => d.fpHash) : [],
    days: body.days === -1 ? null : body.days,
    reason: body.reason,
    by: o,
  });
  await audit(req, 'REPORTER_BLOCKED', { targetType: 'reporter', targetId: reporter._id, details: { days: body.days, includeDevices: body.includeDevices, reason: body.reason } });
  res.json({ ok: true, until: bl.until, blocks: bl.blocks.length });
});

router.post('/reporters/:id/unblock', requireAdmin, async (req, res) => {
  const reporter = await loadReporterInScope(req);
  const n = await liftBlocksForReporter(reporter, req.official.name);
  await audit(req, 'REPORTER_UNBLOCKED', { targetType: 'reporter', targetId: reporter._id, details: { lifted: n } });
  res.json({ ok: true, lifted: n });
});

router.post('/reporters/:id/strikes/:sid/revoke', requireAdmin, async (req, res) => {
  const reporter = await loadReporterInScope(req);
  const s = reporter.strikes.id(req.params.sid);
  if (!s) throw notFound('Strike not found.');
  s.revoked = true;
  await reporter.save();
  await audit(req, 'STRIKE_REVOKED', { targetType: 'reporter', targetId: reporter._id, targetRef: s.ref });
  res.json({ ok: true });
});

export default router;
