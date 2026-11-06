// Helpers shared by the citizen routes: device tracking, fingerprints, views.
import { z } from 'zod';
import { Device } from '../models/index.js';
import { CATEGORY_BY_CODE } from '../data/categories.js';
import { DEPARTMENT_BY_CODE } from '../data/departments.js';
import { STATUS } from './status.js';
import { maskPhone, sha256Hex } from './http.js';

const str = (n) => z.string().max(n).optional();

// Browser fingerprint components sent by the client (all optional, length-limited).
export const fpSchema = z
  .object({
    platform: str(60),
    tz: str(60),
    lang: str(40),
    langs: str(120),
    screen: str(40),
    colorDepth: z.number().int().min(0).max(64).optional(),
    cores: z.number().int().min(0).max(512).optional(),
    memory: z.number().min(0).max(1024).optional(),
    touch: z.number().int().min(0).max(64).optional(),
    canvas: str(80),
    webgl: str(200),
    mobile: z.boolean().optional(),
  })
  .optional()
  .nullable();

export function fpHashOf(fp) {
  if (!fp) return undefined;
  const parts = [fp.platform, fp.tz, fp.screen, fp.colorDepth, fp.cores, fp.memory, fp.touch, fp.canvas, fp.webgl, fp.langs];
  if (parts.filter((x) => x !== undefined && x !== '').length < 4) return undefined;
  return sha256Hex(JSON.stringify(parts)).slice(0, 32);
}

export function upsertIp(list, ip, now = new Date()) {
  if (!ip) return;
  const e = list.find((x) => x.ip === ip);
  if (e) {
    e.lastSeen = now;
    e.count = (e.count || 0) + 1;
  } else {
    list.push({ ip, firstSeen: now, lastSeen: now, count: 1 });
    if (list.length > 40) list.shift();
  }
}

export function upsertReporterDevice(reporter, { deviceId, fpHash, ua, platform }, now = new Date()) {
  const d = reporter.devices.find((x) => x.deviceId === deviceId);
  if (d) {
    d.lastSeen = now;
    if (fpHash) d.fpHash = fpHash;
    d.ua = ua;
  } else {
    reporter.devices.push({ deviceId, fpHash, ua, platform, firstSeen: now, lastSeen: now });
    if (reporter.devices.length > 25) reporter.devices.shift();
  }
}

export async function touchDevice({ deviceId, fpHash, fp, ua, ip, phone, reporterId }) {
  const now = new Date();
  let dev = await Device.findOne({ deviceId });
  if (!dev) dev = new Device({ deviceId, firstSeen: now, phones: [], ips: [], uas: [] });
  dev.lastSeen = now;
  if (fpHash) dev.fpHash = fpHash;
  if (fp) dev.fp = fp;
  if (ua && !dev.uas.includes(ua)) {
    dev.uas.push(ua);
    if (dev.uas.length > 10) dev.uas.shift();
  }
  upsertIp(dev.ips, ip, now);
  if (phone) {
    const p = dev.phones.find((x) => x.phone === phone);
    if (p) p.lastSeen = now;
    else dev.phones.push({ phone, reporter: reporterId, firstSeen: now, lastSeen: now });
  }
  await dev.save();
  return dev;
}

export function trustScore(reporter) {
  if (!reporter) return { score: 50, label: 'New' };
  const strikes = (reporter.strikes || []).filter((s) => !s.revoked).length;
  const st = reporter.stats || {};
  let score = 70 + Math.min(25, (st.resolved || 0) * 5) - strikes * 25 - Math.min(30, (st.rejected || 0) * 10);
  score = Math.max(0, Math.min(100, score));
  const label = score >= 80 ? 'Trusted' : score >= 50 ? 'Normal' : score >= 25 ? 'Watch' : 'Untrusted';
  return { score, label };
}

export function citizenView(reporter, block) {
  const strikes = (reporter.strikes || []).filter((s) => !s.revoked);
  return {
    name: reporter.name,
    phoneMasked: maskPhone(reporter.phone),
    locality: reporter.locality || '',
    reports: reporter.stats?.reports || 0,
    strikes: strikes.length,
    warning: strikes.length
      ? `${strikes.length} of your reports (${strikes.map((s) => s.ref).join(', ')}) were marked as fake / misuse. Further misuse will block your number.`
      : '',
    blocked: block ? { message: block.message, until: block.until, reason: block.reason } : null,
  };
}

const PUBLIC_REASON_STATUSES = new Set(['NEEDS_CORRECTION', 'REFERRED', 'DUPLICATE', 'REJECTED', 'RESOLVED', 'REOPENED', 'RESUBMITTED']);

export function categoryInfo(code) {
  const c = CATEGORY_BY_CODE[code] || CATEGORY_BY_CODE.OTHER;
  return { code: c.code, name: c.name, emoji: c.emoji, group: c.group };
}

const round = (n, d = 4) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

// What anyone holding the reference number may see. `mine` = the original reporter.
export function publicReportView(r, { mine = false } = {}) {
  const st = STATUS[r.status] || {};
  const dept = r.assignment?.department ? DEPARTMENT_BY_CODE[r.assignment.department] : null;
  return {
    ref: r.ref,
    category: categoryInfo(r.category),
    status: r.status,
    statusLabel: st.publicLabel || r.status,
    closed: Boolean(st.closed),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    area: { code: r.area, name: r.areaName, corporation: r.corporation, zone: r.zone },
    landmark: r.sensitive ? '' : r.landmark || '',
    location: r.sensitive ? null : { lat: round(r.location?.coordinates?.[1]), lng: round(r.location?.coordinates?.[0]) },
    department: dept ? dept.name : null,
    slaDueAt: r.slaDueAt,
    supportCount: r.supportCount || 0,
    sensitive: Boolean(r.sensitive),
    timeline: (r.history || [])
      .filter((h) => h.public !== false)
      .map((h) => ({
        status: h.to,
        label: STATUS[h.to]?.publicLabel || h.to,
        at: h.at,
        note: PUBLIC_REASON_STATUSES.has(h.to) || (mine && h.to === 'SPAM') ? h.reason || '' : '',
        by: h.actorType === 'citizen' ? 'You' : h.actorType === 'official' ? 'Official' : 'System',
      })),
    resolution:
      r.status === 'RESOLVED' || r.resolution?.note
        ? {
            note: r.resolution?.note || '',
            at: r.resolution?.at,
            media: (r.media || []).filter((m) => m.role === 'resolution').map((m) => ({ id: String(m.fileId), kind: m.kind })),
          }
        : null,
    duplicateOf: r.duplicateOf || null,
    mine,
    description: mine ? r.description : undefined,
    media: mine ? (r.media || []).filter((m) => m.role === 'evidence' || m.role === 'correction').map((m) => ({ id: String(m.fileId), kind: m.kind })) : [],
    correctionRequest: mine && r.status === 'NEEDS_CORRECTION' ? r.correctionRequest?.message || '' : '',
    canRespond: mine && r.status === 'NEEDS_CORRECTION',
    canReopen:
      mine && r.status === 'RESOLVED' && (r.reopenRequests || []).length < 2 && Date.now() - new Date(r.closedAt || r.updatedAt).getTime() < 30 * 86400000,
  };
}
