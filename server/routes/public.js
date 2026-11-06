// Public (citizen) API: contact sessions, report submission and tracking.
import express from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { Report, Reporter } from '../models/index.js';
import { CATEGORIES, CATEGORY_GROUPS, CATEGORY_BY_CODE } from '../data/categories.js';
import { DEPARTMENT_BY_CODE } from '../data/departments.js';
import { findWard, wardFeature, WARDS, CORPORATIONS, SERVICE_BBOX, CITY_CENTER, haversineM, WARD_ATTRIBUTION } from '../lib/wards.js';
import { STATUS, OPEN_STATUSES } from '../lib/status.js';
import { parse, badRequest, notFound, tooMany, HttpError, clientIp, userAgent, normalisePhone, maskPhone, isLoopback } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { findActiveBlock, blockPayload } from '../lib/blocks.js';
import { sendSms } from '../lib/sms.js';
import { signCitizen, clearCitizen, optionalCitizen, requireCitizen } from '../lib/auth.js';
import { sniffMime, sha256, dhash, saveFile, deleteFile, IMAGE_TYPES, VIDEO_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from '../lib/media.js';
import { analyseText } from '../lib/text.js';
import { assessRisk, findNearbySimilar } from '../lib/risk.js';
import { newReference, normaliseReference } from '../lib/refno.js';
import { audit } from '../lib/audit.js';
import { fpSchema, fpHashOf, touchDevice, upsertIp, upsertReporterDevice, citizenView, publicReportView } from '../lib/citizen.js';
import { getUsageStatus } from '../lib/usage.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_VIDEO_BYTES, files: 7, fields: 10, fieldSize: 64 * 1024 } });

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const contactSessionLimiter = rateLimit({
  windowMs: 15 * MIN,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait before trying again.' } },
});

// ---------------------------------------------------------------- config
router.get('/config', async (req, res) => {
  const s = await getSettings();
  const usage = await getUsageStatus().catch(() => null);
  res.json({
    freeTier: usage ? { notice: usage.publicNotice, uploadsPaused: usage.uploadsPaused, videosPaused: usage.videosPaused } : null,
    categories: CATEGORIES.filter((c) => !c.sensitive || s.sensitiveIntakeEnabled).map((c) => ({
      code: c.code,
      group: c.group,
      name: c.name,
      emoji: c.emoji,
      slaDays: c.slaDays,
      severity: c.severity,
      popular: Boolean(c.popular),
      sensitive: Boolean(c.sensitive),
      hint: c.hint || '',
      department: DEPARTMENT_BY_CODE[c.dept]?.name || '',
    })),
    groups: CATEGORY_GROUPS.map(({ code, name }) => ({ code, name })),
    statuses: Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, { label: v.label, publicLabel: v.publicLabel, closed: v.closed }])),
    settings: {
      maxPhotos: s.maxPhotos,
      maxVideoSeconds: s.maxVideoSeconds,
      requireDeviceLocation: s.requireDeviceLocation,
      maxPinDistanceM: s.maxPinDistanceM,
      allowGalleryUploads: s.allowGalleryUploads,
      duplicateRadiusM: s.duplicateRadiusM,
      maxReportsPerHour: s.maxReportsPerHour,
      maxReportsPerDay: s.maxReportsPerDay,
    },
    city: { center: CITY_CENTER, bbox: SERVICE_BBOX },
    corporations: CORPORATIONS.map((c) => ({ key: c.key, name: c.name, wardCount: c.wardCount })),
    wardCount: WARDS.length,
    wardAttribution: WARD_ATTRIBUTION,
  });
});

router.get('/wards', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(WARDS.map((w) => ({ code: w.code, name: w.name, corporation: w.corporation, zone: w.zone })));
});

// ---------------------------------------------------------------- geo
const latLng = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

router.get('/geo/locate', (req, res) => {
  const { lat, lng } = parse(latLng, req.query);
  const w = findWard(lat, lng);
  res.json({
    inside: Boolean(w),
    ward: w ? { code: w.code, name: w.name, corporation: w.corporation, zone: w.zone, assembly: w.assembly } : null,
  });
});

router.get('/geo/ward/:code', (req, res) => {
  const f = wardFeature(String(req.params.code).toUpperCase());
  if (!f) throw notFound('Ward not found');
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(f);
});

// Reverse geocoding through OpenStreetMap Nominatim (cached, max 1 request/second).
const addrCache = new Map();
let lastNominatim = 0;
router.get('/geo/address', async (req, res) => {
  const { lat, lng } = parse(latLng, req.query);
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (addrCache.has(key)) return res.json({ address: addrCache.get(key) });
  if (Date.now() - lastNominatim < 1100) return res.json({ address: '' });
  lastNominatim = Date.now();
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'NimmaBengaluru/1.0 (academic civic-tech prototype)' },
      signal: AbortSignal.timeout(4000),
    });
    const data = await r.json();
    const a = data.address || {};
    const parts = [a.road || a.pedestrian || a.footway, a.neighbourhood || a.suburb || a.quarter, a.city_district || a.city || a.town].filter(Boolean);
    const address = [...new Set(parts)].join(', ') || data.display_name?.split(',').slice(0, 3).join(',') || '';
    if (addrCache.size > 2000) addrCache.clear();
    addrCache.set(key, address);
    res.json({ address });
  } catch {
    res.json({ address: '' });
  }
});

// ---------------------------------------------------------------- contact session (the submitted phone number is not verified)
const contactBody = z.object({ phone: z.string().max(20), name: z.string().trim().min(2, 'Enter your full name').max(60), fp: fpSchema });

router.post('/session/start', contactSessionLimiter, async (req, res) => {
  const body = parse(contactBody, req.body);
  const phone = normalisePhone(body.phone);
  if (!phone) throw badRequest('Enter a valid 10-digit Indian mobile number.');
  const ip = clientIp(req);
  const fpHash = fpHashOf(body.fp);
  const ua = userAgent(req);
  const now = new Date();
  const block = await findActiveBlock({ phone, deviceId: req.deviceId, fpHash, ip });
  if (block) {
    await audit(req, 'BLOCKED_USER_ATTEMPT', { targetType: 'phone', targetId: maskPhone(phone), details: { step: 'contact-session', blockType: block.type, deviceId: req.deviceId, ip } });
    const p = blockPayload(block);
    throw new HttpError(403, 'BLOCKED', p.message, p);
  }

  let reporter = await Reporter.findOne({ phone });
  if (!reporter) reporter = new Reporter({ phone, firstSeenAt: now, names: [], localities: [], devices: [], ips: [], contactClaims: [], strikes: [] });
  reporter.name = body.name;
  reporter.names ||= [];
  if (!reporter.names.includes(body.name)) reporter.names.push(body.name);
  reporter.lastSeenAt = now;
  upsertReporterDevice(reporter, { deviceId: req.deviceId, fpHash, ua, platform: body.fp?.platform }, now);
  upsertIp(reporter.ips, ip, now);
  reporter.contactClaims ||= [];
  reporter.contactClaims.push({ at: now, ip, deviceId: req.deviceId, ua, name: body.name });
  if (reporter.contactClaims.length > 60) reporter.contactClaims.splice(0, reporter.contactClaims.length - 60);
  try {
    await reporter.save();
  } catch (err) {
    if (err?.code !== 11000) throw err;
    reporter = await Reporter.findOne({ phone });
    if (!reporter) throw err;
  }
  await touchDevice({ deviceId: req.deviceId, fpHash, fp: body.fp, ua, ip, phone, reporterId: reporter._id });
  signCitizen(res, req, reporter);
  res.json({ citizen: citizenView(reporter, null) });
});

router.get('/session', optionalCitizen, async (req, res) => {
  if (!req.citizen) return res.json({ citizen: null });
  const block = await findActiveBlock({ phone: req.citizen.phone, deviceId: req.deviceId });
  res.json({ citizen: citizenView(req.citizen, block ? blockPayload(block) : null) });
});

router.post('/logout', (req, res) => {
  clearCitizen(res, req);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- duplicate check (before submit)
router.post('/reports/nearby', requireCitizen, async (req, res) => {
  const body = parse(z.object({ lat: z.number(), lng: z.number(), category: z.string().max(40) }), req.body);
  const s = await getSettings();
  const items = await findNearbySimilar({ ...body, radiusM: s.duplicateRadiusM });
  res.json({ items: items.map((x) => ({ ...x, statusLabel: STATUS[x.status]?.publicLabel })) });
});

// ---------------------------------------------------------------- submit a report
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(1e6).optional().nullable() });
const mediaMeta = z.object({
  kind: z.enum(['image', 'video']),
  captureMethod: z.enum(['live', 'native', 'gallery']),
  capturedAt: z.string().max(40).optional().nullable(),
  gps: point.optional().nullable(),
  exifDate: z.string().max(40).optional().nullable(),
  exifLat: z.number().optional().nullable(),
  exifLng: z.number().optional().nullable(),
  width: z.number().int().min(0).max(20000).optional().nullable(),
  height: z.number().int().min(0).max(20000).optional().nullable(),
  durationSec: z.number().min(0).max(600).optional().nullable(),
});
const reportBody = z.object({
  category: z.string().max(40),
  description: z.string().trim().min(20, 'Please describe the issue in at least 20 characters').max(1000, 'Description is too long (max 1000 characters)'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  hazard: z.boolean().optional().default(false),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  locationSource: z.enum(['gps', 'gps-adjusted', 'map']),
  locationAccuracy: z.number().min(0).max(1e6).optional().nullable(),
  landmark: z.string().trim().max(160).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
  locality: z.string().trim().min(2, 'Enter your residential locality').max(80),
  deviceLocation: point.extend({ at: z.string().max(40).optional() }).optional().nullable(),
  media: z.array(mediaMeta).min(1, 'Add at least one photo').max(7),
  startedAt: z.string().max(40).optional().nullable(),
  formDurationMs: z.number().int().min(0).max(7 * 86400000).optional().nullable(),
  declaration: z.boolean().refine((v) => v === true, 'You must accept the declaration'),
  website: z.string().max(200).optional().default(''), // honeypot: real users never fill this
  fp: fpSchema,
  screen: z.string().max(40).optional(),
  tz: z.string().max(60).optional(),
  lang: z.string().max(40).optional(),
});

const toDate = (v) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

// Free plan storage almost full → refuse uploads before reading them into memory.
async function freeTierGate(req, res, next) {
  const usage = await getUsageStatus().catch(() => null);
  if (usage?.uploadsPaused) {
    return next(new HttpError(503, 'FREE_TIER_FULL', 'This app runs on a free plan and its storage is full, so new reports are paused. Please try again later or call the civic helpline 1533.'));
  }
  req.freeTier = usage;
  next();
}

router.post('/reports', requireCitizen, freeTierGate, upload.array('media', 7), async (req, res) => {
  const s = await getSettings();
  let raw;
  try {
    raw = JSON.parse(req.body?.data || '{}');
  } catch {
    throw badRequest('Malformed submission.');
  }
  const data = parse(reportBody, raw);
  const reporter = req.citizen;
  const ip = clientIp(req);
  const ua = userAgent(req);
  const fpHash = fpHashOf(data.fp);
  const files = req.files || [];

  // Bot trap
  if (data.website) {
    await audit(req, 'BOT_TRAP_TRIGGERED', { targetType: 'reporter', targetId: reporter._id, details: { ip, deviceId: req.deviceId } });
    throw badRequest('Submission rejected.');
  }

  // Blocked?
  const block = await findActiveBlock({ phone: reporter.phone, deviceId: req.deviceId, fpHash, ip });
  if (block) {
    await audit(req, 'BLOCKED_USER_ATTEMPT', { targetType: 'reporter', targetId: reporter._id, details: { step: 'submit', blockType: block.type, ip, deviceId: req.deviceId } });
    const p = blockPayload(block);
    throw new HttpError(403, 'BLOCKED', p.message, p);
  }

  // Category
  const cat = CATEGORY_BY_CODE[data.category];
  if (!cat) throw badRequest('Choose a valid issue category.');
  if (cat.sensitive && !s.sensitiveIntakeEnabled) throw badRequest('Confidential complaints are not being accepted on this portal right now.');

  // Location: must be inside Bengaluru (GBA) and the reporter must be at the spot
  const ward = findWard(data.lat, data.lng);
  if (!ward) throw badRequest('This location is outside the Greater Bengaluru (GBA) service area. Please move the pin to a spot inside Bengaluru.');
  if (s.requireDeviceLocation && !data.deviceLocation) {
    throw badRequest('Live location is required. Please turn on location (GPS) and allow it for this website.');
  }
  if (data.deviceLocation) {
    const d = haversineM(data.deviceLocation.lat, data.deviceLocation.lng, data.lat, data.lng);
    const slack = Math.min(500, data.deviceLocation.accuracy || 0);
    if (d > s.maxPinDistanceM + slack) {
      await audit(req, 'REPORT_REJECTED_DISTANCE', { targetType: 'reporter', targetId: reporter._id, details: { distanceM: Math.round(d), ip, deviceId: req.deviceId } });
      throw badRequest(`You are ${(d / 1000).toFixed(1)} km away from the pin. Reports must be made at the spot (within ${s.maxPinDistanceM} m).`);
    }
  }

  // Rate limits (per mobile number and per device)
  const now = Date.now();
  const [lastOwn, inHour, inDay, devDay] = await Promise.all([
    Report.findOne({ reporter: reporter._id }).sort({ createdAt: -1 }).select('createdAt ref').lean(),
    Report.countDocuments({ reporter: reporter._id, createdAt: { $gte: new Date(now - HOUR) } }),
    Report.countDocuments({ reporter: reporter._id, createdAt: { $gte: new Date(now - DAY) } }),
    Report.countDocuments({ 'client.deviceId': req.deviceId, createdAt: { $gte: new Date(now - DAY) } }),
  ]);
  const limitHit = async (msg, details) => {
    await audit(req, 'REPORT_RATE_LIMITED', { targetType: 'reporter', targetId: reporter._id, details: { ...details, ip, deviceId: req.deviceId } });
    throw tooMany(msg, details);
  };
  if (lastOwn && s.cooldownMinutes > 0 && now - new Date(lastOwn.createdAt).getTime() < s.cooldownMinutes * MIN) {
    const wait = Math.ceil((s.cooldownMinutes * MIN - (now - new Date(lastOwn.createdAt).getTime())) / 1000);
    await limitHit(`Please wait ${wait} seconds before submitting another report.`, { retryAfter: wait });
  }
  if (inHour >= s.maxReportsPerHour) await limitHit(`You can submit at most ${s.maxReportsPerHour} reports per hour.`, { inHour });
  if (inDay >= s.maxReportsPerDay) await limitHit(`Daily limit reached: at most ${s.maxReportsPerDay} reports per day from one mobile number.`, { inDay });
  if (devDay >= s.maxReportsPerDevicePerDay) await limitHit('Daily limit reached for this phone.', { devDay });

  // Media checks
  if (files.length !== data.media.length) throw badRequest('Photo / video upload was incomplete. Please try again.');
  let images = 0;
  let videos = 0;
  const prepared = [];
  for (const [i, f] of files.entries()) {
    const meta = data.media[i];
    const mime = sniffMime(f.buffer);
    if (meta.kind === 'image') {
      if (!IMAGE_TYPES.has(mime)) throw badRequest(`Photo ${i + 1} is not a supported image (JPEG/PNG/WebP).`);
      if (f.size > MAX_IMAGE_BYTES) throw badRequest(`Photo ${i + 1} is too large (max 10 MB).`);
      images++;
    } else {
      if (!VIDEO_TYPES.has(mime)) throw badRequest('The video format is not supported (MP4/WebM/MOV only).');
      if (f.size > MAX_VIDEO_BYTES) throw badRequest('The video is too large (max 25 MB). Record a shorter clip.');
      videos++;
    }
    if (meta.captureMethod === 'gallery' && !s.allowGalleryUploads) throw badRequest('Photos must be taken live with the camera. Gallery uploads are disabled.');
    prepared.push({ f, meta, mime, sha: sha256(f.buffer) });
  }
  if (images < 1) throw badRequest('At least one photo of the issue is required.');
  if (images > s.maxPhotos) throw badRequest(`At most ${s.maxPhotos} photos are allowed.`);
  if (videos > 1) throw badRequest('Only one video is allowed per report.');
  if (videos && req.freeTier?.videosPaused) throw badRequest('Video uploads are paused because the free-plan storage is almost full. Please send photos only.');

  // The exact same photo / video already exists → reject (stops copy-paste spam)
  const dupMedia = await Report.findOne({ 'media.sha256': { $in: prepared.map((p) => p.sha) } }, { ref: 1, reporter: 1 }).lean();
  if (dupMedia) {
    const same = String(dupMedia.reporter) === String(reporter._id);
    await audit(req, 'DUPLICATE_MEDIA_REJECTED', { targetType: 'reporter', targetId: reporter._id, targetRef: dupMedia.ref, details: { sameReporter: same, ip, deviceId: req.deviceId } });
    throw new HttpError(409, 'DUPLICATE_MEDIA', same ? `You already submitted this photo in report ${dupMedia.ref}. Track it instead.` : 'This photo was already submitted by someone else. Please take a new photo of the issue.');
  }

  // Perceptual hashes (near-duplicates) for JPEG photos
  for (const p of prepared) {
    if (p.mime === 'image/jpeg') {
      const h = dhash(p.f.buffer);
      if (h) {
        p.phash = h.hash;
        p.width = h.width;
        p.height = h.height;
      }
    }
  }

  const text = analyseText(data.description);
  const deviceLoc = data.deviceLocation ? { lat: data.deviceLocation.lat, lng: data.deviceLocation.lng, accuracy: data.deviceLocation.accuracy || 0 } : null;
  const risk = await assessRisk({
    reporter,
    deviceId: req.deviceId,
    fpHash,
    ip,
    lat: data.lat,
    lng: data.lng,
    category: cat.code,
    deviceLoc,
    media: prepared.map((p) => ({
      kind: p.meta.kind,
      captureMethod: p.meta.captureMethod,
      exifDate: toDate(p.meta.exifDate),
      exifLat: p.meta.exifLat ?? undefined,
      exifLng: p.meta.exifLng ?? undefined,
      phash: p.phash,
    })),
    formDurationMs: data.formDurationMs ?? undefined,
    text,
    duplicateRadiusM: s.duplicateRadiusM,
  });

  // Store media in GridFS
  const ref = newReference();
  const savedIds = [];
  try {
    const media = [];
    for (const [i, p] of prepared.entries()) {
      const fileId = await saveFile(p.f.buffer, {
        filename: `${ref}-${i + 1}`,
        contentType: p.mime,
        metadata: { ref, role: 'evidence', sha256: p.sha },
      });
      savedIds.push(fileId);
      media.push({
        fileId,
        kind: p.meta.kind,
        mime: p.mime,
        size: p.f.size,
        sha256: p.sha,
        phash: p.phash,
        role: 'evidence',
        captureMethod: p.meta.captureMethod,
        capturedAt: toDate(p.meta.capturedAt),
        gps: p.meta.gps || undefined,
        exifDate: toDate(p.meta.exifDate),
        exifLat: p.meta.exifLat ?? undefined,
        exifLng: p.meta.exifLng ?? undefined,
        width: p.width || p.meta.width || undefined,
        height: p.height || p.meta.height || undefined,
        durationSec: p.meta.durationSec ?? undefined,
        uploadedBy: 'citizen',
      });
    }

    const nowDate = new Date();
    const history = [{ from: null, to: 'SUBMITTED', reason: 'Report submitted by citizen', actorType: 'citizen', actorId: reporter._id, actorName: reporter.name, at: nowDate, public: true }];
    if (risk.level === 'high') {
      history.push({ from: 'SUBMITTED', to: 'SUBMITTED', reason: `Flagged by automatic misuse checks (risk score ${risk.score}/100)`, actorType: 'system', actorName: 'System', at: nowDate, public: false });
    }

    let report;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        report = await Report.create({
          ref: attempt === 0 ? ref : newReference(),
          category: cat.code,
          group: cat.group,
          description: data.description,
          severity: data.hazard && data.severity !== 'critical' ? 'high' : data.severity,
          hazard: data.hazard,
          location: { type: 'Point', coordinates: [data.lng, data.lat] },
          locationAccuracy: data.locationAccuracy ?? undefined,
          locationSource: data.locationSource,
          landmark: data.landmark,
          address: data.address,
          area: ward.code,
          areaName: ward.name,
          corporation: ward.corporation,
          zone: ward.zone,
          reporter: reporter._id,
          reporterSnapshot: { name: reporter.name, phone: reporter.phone, locality: data.locality },
          client: {
            deviceId: req.deviceId,
            fpHash,
            ip,
            ua,
            platform: data.fp?.platform,
            screen: data.screen || data.fp?.screen,
            tz: data.tz || data.fp?.tz,
            lang: data.lang || data.fp?.lang,
            deviceLocation: deviceLoc ? { ...deviceLoc, at: toDate(data.deviceLocation?.at) || nowDate } : undefined,
            distanceToIssueM: risk.distanceToIssueM,
            formDurationMs: data.formDurationMs ?? undefined,
            startedAt: toDate(data.startedAt),
            viaTunnel: isLoopback(req) && Boolean(req.headers['x-forwarded-for']),
          },
          media,
          status: 'SUBMITTED',
          history,
          sensitive: Boolean(cat.sensitive),
          risk: { score: risk.score, level: risk.level, signals: risk.signals },
          possibleDuplicates: risk.possibleDuplicates.map((d) => d.ref),
          slaDueAt: new Date(now + cat.slaDays * DAY),
        });
        break;
      } catch (err) {
        if (err?.code === 11000 && String(err.message).includes('ref')) continue;
        throw err;
      }
    }
    if (!report) throw new Error('Could not allocate a reference number');

    reporter.stats.reports = (reporter.stats.reports || 0) + 1;
    reporter.locality = data.locality;
    if (!reporter.localities.includes(data.locality)) reporter.localities.push(data.locality);
    upsertIp(reporter.ips, ip);
    reporter.lastSeenAt = new Date();
    await reporter.save();
    await touchDevice({ deviceId: req.deviceId, fpHash, fp: data.fp, ua, ip, phone: reporter.phone, reporterId: reporter._id });

    if (risk.level === 'high') {
      await audit(req, 'HIGH_RISK_REPORT', { targetType: 'report', targetId: report._id, targetRef: report.ref, details: { score: risk.score, signals: risk.signals.map((x) => x.code) } });
    }
    sendSms(reporter.phone, `Nimma Bengaluru: your report ${report.ref} (${cat.name}) is received. Track it with this reference number.`).catch(() => {});

    res.status(201).json({
      ref: report.ref,
      status: report.status,
      category: { code: cat.code, name: cat.name, emoji: cat.emoji },
      area: { code: ward.code, name: ward.name, corporation: ward.corporation },
      slaDueAt: report.slaDueAt,
      department: DEPARTMENT_BY_CODE[cat.dept]?.name,
      possibleDuplicates: risk.possibleDuplicates.length,
    });
  } catch (err) {
    for (const id of savedIds) await deleteFile(id);
    throw err;
  }
});

// ---------------------------------------------------------------- support an existing report ("me too")
router.post('/reports/:ref/support', requireCitizen, async (req, res) => {
  const ref = normaliseReference(req.params.ref);
  if (!ref) throw badRequest('Invalid reference number.');
  const r = await Report.findOne({ ref });
  if (!r || r.sensitive) throw notFound('Report not found.');
  if (!OPEN_STATUSES.includes(r.status)) throw badRequest('This report is already closed.');
  if (String(r.reporter) === String(req.citizen._id)) throw badRequest('You reported this issue yourself.');
  const block = await findActiveBlock({ phone: req.citizen.phone, deviceId: req.deviceId });
  if (block) {
    const p = blockPayload(block);
    throw new HttpError(403, 'BLOCKED', p.message, p);
  }
  const today = await Report.countDocuments({ 'supporters.reporter': req.citizen._id, 'supporters.at': { $gte: new Date(Date.now() - DAY) } });
  if (today >= 20) throw tooMany('You have supported too many reports today.');
  if (r.supporters.some((x) => String(x.reporter) === String(req.citizen._id))) {
    return res.json({ ok: true, supportCount: r.supportCount, already: true });
  }
  r.supporters.push({ reporter: req.citizen._id, at: new Date() });
  r.supportCount = r.supporters.length;
  await r.save();
  res.json({ ok: true, supportCount: r.supportCount });
});

// ---------------------------------------------------------------- tracking
router.get('/track/:ref', optionalCitizen, async (req, res) => {
  const ref = normaliseReference(req.params.ref);
  if (!ref) throw badRequest('Enter a valid reference number, e.g. NB-K7QX-3MPA.');
  const r = await Report.findOne({ ref }).lean();
  if (!r) throw notFound('No report found with this reference number.');
  const mine = Boolean(req.citizen && String(r.reporter) === String(req.citizen._id) && r.client?.deviceId === req.deviceId);
  res.json({ report: publicReportView(r, { mine }) });
});

router.get('/my-reports', requireCitizen, async (req, res) => {
  const rows = await Report.find({ reporter: req.citizen._id, 'client.deviceId': req.deviceId }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({
    items: rows.map((r) => {
      const v = publicReportView(r, { mine: true });
      return {
        ref: v.ref,
        category: v.category,
        status: v.status,
        statusLabel: v.statusLabel,
        closed: v.closed,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        area: v.area,
        thumb: v.media.find((m) => m.kind === 'image')?.id || null,
        needsAction: v.canRespond,
      };
    }),
  });
});

// Citizen answers a "needs correction" request with more details / a new live photo
router.post('/reports/:ref/respond', requireCitizen, freeTierGate, upload.array('media', 3), async (req, res) => {
  const ref = normaliseReference(req.params.ref);
  const r = ref && (await Report.findOne({ ref }));
  if (!r || String(r.reporter) !== String(req.citizen._id) || r.client?.deviceId !== req.deviceId) throw notFound('Report not found.');
  if (r.status !== 'NEEDS_CORRECTION') throw badRequest('This report is not waiting for more information.');
  const body = parse(z.object({ text: z.string().trim().min(5, 'Please write a short reply').max(800) }), req.body);
  const ids = [];
  for (const [i, f] of (req.files || []).entries()) {
    const mime = sniffMime(f.buffer);
    if (!IMAGE_TYPES.has(mime) || f.size > MAX_IMAGE_BYTES) throw badRequest('Only photos (max 10 MB) can be attached.');
    const sha = sha256(f.buffer);
    const fileId = await saveFile(f.buffer, { filename: `${r.ref}-c${Date.now()}-${i}`, contentType: mime, metadata: { ref: r.ref, role: 'correction', sha256: sha } });
    ids.push(fileId);
    r.media.push({ fileId, kind: 'image', mime, size: f.size, sha256: sha, phash: mime === 'image/jpeg' ? dhash(f.buffer)?.hash : undefined, role: 'correction', captureMethod: 'live', uploadedBy: 'citizen' });
  }
  r.citizenResponses.push({ text: body.text, at: new Date(), mediaIds: ids });
  r.history.push({ from: r.status, to: 'RESUBMITTED', reason: `Citizen replied: ${body.text.slice(0, 200)}`, actorType: 'citizen', actorId: req.citizen._id, actorName: req.citizen.name, public: true });
  r.status = 'RESUBMITTED';
  await r.save();
  res.json({ report: publicReportView(r.toObject(), { mine: true }) });
});

// Citizen says the issue is not actually fixed → reopen (max twice, within 30 days)
router.post('/reports/:ref/reopen', requireCitizen, async (req, res) => {
  const ref = normaliseReference(req.params.ref);
  const r = ref && (await Report.findOne({ ref }));
  if (!r || String(r.reporter) !== String(req.citizen._id) || r.client?.deviceId !== req.deviceId) throw notFound('Report not found.');
  const v = publicReportView(r.toObject(), { mine: true });
  if (!v.canReopen) throw badRequest('This report cannot be reopened.');
  const body = parse(z.object({ reason: z.string().trim().min(10, 'Tell us what is still wrong (at least 10 characters)').max(500) }), req.body);
  r.reopenRequests.push({ reason: body.reason, at: new Date() });
  r.history.push({ from: r.status, to: 'REOPENED', reason: `Citizen: ${body.reason}`, actorType: 'citizen', actorId: req.citizen._id, actorName: req.citizen.name, public: true });
  r.status = 'REOPENED';
  r.closedAt = undefined;
  await r.save();
  res.json({ report: publicReportView(r.toObject(), { mine: true }) });
});

// ---------------------------------------------------------------- public statistics & map
let statsCache = null;
let statsAt = 0;
router.get('/stats', async (req, res) => {
  if (statsCache && Date.now() - statsAt < 30000) return res.json(statsCache);
  const base = { sensitive: { $ne: true } };
  const [byStatus, byCategory, resolvedAgg, misuseBlocked] = await Promise.all([
    Report.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Report.aggregate([{ $match: { ...base, status: { $nin: ['SPAM', 'REJECTED'] } } }, { $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]),
    Report.aggregate([
      { $match: { ...base, status: 'RESOLVED', closedAt: { $exists: true } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ['$closedAt', '$createdAt'] } } } },
    ]),
    Report.countDocuments({ status: 'SPAM' }),
  ]);
  const counts = Object.fromEntries(byStatus.map((x) => [x._id, x.n]));
  const total = Object.entries(counts).filter(([k]) => !['SPAM', 'REJECTED'].includes(k)).reduce((a, [, n]) => a + n, 0);
  const resolved = counts.RESOLVED || 0;
  const inProgress = ['ASSIGNED', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'REOPENED'].reduce((a, k) => a + (counts[k] || 0), 0);
  statsCache = {
    total,
    resolved,
    inProgress,
    pending: ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'RESUBMITTED'].reduce((a, k) => a + (counts[k] || 0), 0),
    resolvedPct: total ? Math.round((resolved / total) * 100) : 0,
    avgResolutionDays: resolvedAgg[0] ? Math.round((resolvedAgg[0].avgMs / DAY) * 10) / 10 : null,
    misuseBlocked,
    topCategories: byCategory.map((x) => ({ code: x._id, n: x.n, name: CATEGORY_BY_CODE[x._id]?.name, emoji: CATEGORY_BY_CODE[x._id]?.emoji })),
    wards: WARDS.length,
  };
  statsAt = Date.now();
  res.json(statsCache);
});

export default router;
