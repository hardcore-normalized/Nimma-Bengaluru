// Misuse risk score for each new report.
// Every signal is explainable ("why is this flagged?") so an official can judge
// quickly and has concrete evidence if the report turns out to be fake.
import { Report, Device } from '../models/index.js';
import { OPEN_STATUSES } from './status.js';
import { haversineM } from './wards.js';
import { hamming } from './media.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;

function km(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function riskLevel(score) {
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

/**
 * @param ctx {
 *   reporter, deviceId, fpHash, ip, lat, lng, category,
 *   deviceLoc: {lat,lng,accuracy} | null,
 *   media: [{ kind, captureMethod, exifDate, exifLat, exifLng, phash }],
 *   formDurationMs, text: analyseText() result, excludeReportId
 * }
 */
export async function assessRisk(ctx) {
  const now = Date.now();
  const signals = [];
  const add = (code, weight, label) => signals.push({ code, weight, label });
  const { reporter } = ctx;

  // 1. Reporter history
  const strikes = reporter ? reporter.strikes.filter((s) => !s.revoked) : [];
  if (strikes.length) add('PRIOR_STRIKES', Math.min(60, strikes.length * 20), `Reporter already has ${strikes.length} misuse strike(s) (${strikes.map((s) => s.ref).join(', ')})`);
  if (reporter && (reporter.stats?.rejected || 0) >= 2) add('PRIOR_REJECTIONS', 10, `${reporter.stats.rejected} earlier reports were rejected as not actionable`);
  const trusted = reporter && !strikes.length && (reporter.stats?.resolved || 0) >= 3;
  if (trusted) add('TRUSTED_REPORTER', -15, `Trusted reporter: ${reporter.stats.resolved} earlier reports were genuine and resolved`);

  // 2. Was the reporter physically near the issue?
  if (!ctx.deviceLoc || !Number.isFinite(ctx.deviceLoc.lat)) {
    add('NO_DEVICE_GPS', 25, 'Reporter did not share live GPS location while submitting');
  } else {
    const d = haversineM(ctx.deviceLoc.lat, ctx.deviceLoc.lng, ctx.lat, ctx.lng);
    ctx.distanceToIssueM = Math.round(d);
    if (d > 5000) add('FAR_FROM_ISSUE', 45, `Reporter was ${km(d)} away from the reported spot`);
    else if (d > 1000) add('FAR_FROM_ISSUE', 30, `Reporter was ${km(d)} away from the reported spot`);
    else if (d > 300) add('FAR_FROM_ISSUE', 12, `Reporter was ${km(d)} away from the reported spot`);
    const acc = ctx.deviceLoc.accuracy;
    if (acc > 1000) add('WEAK_GPS', 18, `Very imprecise device location (±${km(acc)}) – possibly not a real GPS fix`);
    else if (acc > 150) add('WEAK_GPS', 6, `Imprecise device location (±${km(acc)})`);
  }

  // 3. Photo / video authenticity
  for (const [i, m] of (ctx.media || []).entries()) {
    const n = `Photo ${i + 1}`;
    if (m.captureMethod === 'gallery') add('GALLERY_UPLOAD', 20, `${n} was picked from the gallery, not captured live`);
    if (m.captureMethod === 'native' && m.kind === 'image') {
      if (!m.exifDate) add('NO_EXIF_TIME', 8, `${n} has no camera timestamp (EXIF)`);
      else {
        const age = now - new Date(m.exifDate).getTime();
        if (age > 7 * DAY) add('OLD_PHOTO', 40, `${n} was taken ${Math.round(age / DAY)} days before submission`);
        else if (age > DAY) add('OLD_PHOTO', 25, `${n} was taken ${Math.round(age / HOUR)} hours before submission`);
        else if (age > 3 * HOUR) add('OLD_PHOTO', 8, `${n} was taken ${Math.round(age / HOUR)} hours before submission`);
      }
    }
    if (Number.isFinite(m.exifLat) && Number.isFinite(m.exifLng)) {
      const d = haversineM(m.exifLat, m.exifLng, ctx.lat, ctx.lng);
      if (d > 1000) add('PHOTO_GPS_MISMATCH', 20, `${n} GPS tag is ${km(d)} from the reported spot`);
    }
  }

  // 4. Re-used photos (near-identical image already in another report)
  const hashes = (ctx.media || []).filter((m) => m.phash);
  if (hashes.length) {
    const recent = await Report.find(
      { createdAt: { $gte: new Date(now - 180 * DAY) }, 'media.phash': { $exists: true }, _id: { $ne: ctx.excludeReportId } },
      { ref: 1, reporter: 1, 'media.phash': 1 }
    )
      .sort({ createdAt: -1 })
      .limit(4000)
      .lean();
    const hits = new Map();
    for (const r of recent) {
      for (const om of r.media || []) {
        if (!om.phash) continue;
        for (const m of hashes) {
          if (hamming(m.phash, om.phash) <= 6) hits.set(r.ref, String(r.reporter) === String(reporter?._id));
        }
      }
    }
    for (const [ref, same] of hits) {
      add('REUSED_PHOTO', same ? 25 : 40, `Photo is almost identical to one in report ${ref}${same ? ' (same reporter)' : ' (different reporter)'}`);
    }
  }

  // 5. Bursts / flooding
  if (reporter) {
    const [h1, d1] = await Promise.all([
      Report.countDocuments({ reporter: reporter._id, createdAt: { $gte: new Date(now - HOUR) } }),
      Report.countDocuments({ reporter: reporter._id, createdAt: { $gte: new Date(now - DAY) } }),
    ]);
    if (h1 >= 2) add('BURST_HOUR', 12, `${h1} reports from this number in the last hour`);
    if (d1 >= 4) add('BURST_DAY', 18, `${d1} reports from this number in the last 24 hours`);

    const sameSpot = await Report.countDocuments({
      reporter: reporter._id,
      category: ctx.category,
      createdAt: { $gte: new Date(now - 7 * DAY) },
      location: { $geoWithin: { $centerSphere: [[ctx.lng, ctx.lat], 120 / 6378100] } },
    });
    if (sameSpot >= 1) add('SAME_SPOT_REPEAT', 20, `Same person already reported this issue at this spot ${sameSpot} time(s) this week`);
  }
  if (ctx.deviceId) {
    const devDay = await Report.countDocuments({ 'client.deviceId': ctx.deviceId, createdAt: { $gte: new Date(now - DAY) } });
    if (devDay >= 5) add('DEVICE_BURST', 15, `${devDay} reports from this phone in the last 24 hours`);
  }

  // 6. One phone, many identities (sock puppets)
  if (ctx.deviceId) {
    const dev = await Device.findOne({ deviceId: ctx.deviceId }, { phones: 1 }).lean();
    const phones = new Set((dev?.phones || []).map((p) => p.phone));
    if (phones.size >= 3) add('MULTI_NUMBER_DEVICE', 35, `This phone has been used with ${phones.size} different mobile numbers`);
    else if (phones.size === 2) add('MULTI_NUMBER_DEVICE', 12, 'This phone has been used with 2 different mobile numbers');
  }
  if (ctx.fpHash) {
    const devs = await Device.find({ fpHash: ctx.fpHash }, { phones: 1, deviceId: 1 }).limit(50).lean();
    const phones = new Set(devs.flatMap((d) => (d.phones || []).map((p) => p.phone)));
    if (devs.length >= 2 && phones.size >= 3) add('FINGERPRINT_REUSE', 20, `Same browser fingerprint seen on ${devs.length} cleared devices with ${phones.size} numbers`);
  }

  // 7. Network shared with known misusers
  if (ctx.ip && !/^(127\.|::1)/.test(ctx.ip)) {
    const misusers = await Report.distinct('reporter', { 'client.ip': ctx.ip, status: 'SPAM', createdAt: { $gte: new Date(now - 30 * DAY) } });
    const others = misusers.filter((id) => String(id) !== String(reporter?._id));
    if (others.length) add('IP_OF_MISUSER', 12, `Same network (IP ${ctx.ip}) was used by ${others.length} reporter(s) caught for misuse`);
  }

  // 8. Behaviour & text
  if (Number.isFinite(ctx.formDurationMs) && ctx.formDurationMs > 0 && ctx.formDurationMs < 25000) {
    add('TOO_FAST', 15, `Report completed in ${Math.round(ctx.formDurationMs / 1000)} seconds (bot-like)`);
  }
  if (ctx.text?.abusive) add('ABUSIVE_TEXT', 20, 'Description contains abusive language');
  if (ctx.text?.gibberish) add('GIBBERISH_TEXT', 15, `Description looks meaningless (${ctx.text.gibberishReasons.join(', ')})`);

  // Nearby open reports of the same issue (not a risk by itself – helps avoid duplicates)
  const possibleDuplicates = await findNearbySimilar({ lat: ctx.lat, lng: ctx.lng, category: ctx.category, radiusM: ctx.duplicateRadiusM || 75, excludeId: ctx.excludeReportId });

  const score = Math.max(0, Math.min(100, signals.reduce((s, x) => s + x.weight, 0)));
  return { score, level: riskLevel(score), signals: signals.sort((a, b) => b.weight - a.weight), possibleDuplicates, distanceToIssueM: ctx.distanceToIssueM };
}

export async function findNearbySimilar({ lat, lng, category, radiusM = 75, excludeId, limit = 5 }) {
  const q = {
    category,
    status: { $in: OPEN_STATUSES },
    createdAt: { $gte: new Date(Date.now() - 45 * DAY) },
    location: { $geoWithin: { $centerSphere: [[lng, lat], radiusM / 6378100] } },
  };
  if (excludeId) q._id = { $ne: excludeId };
  const rows = await Report.find(q, { ref: 1, status: 1, category: 1, location: 1, createdAt: 1, supportCount: 1, areaName: 1, landmark: 1, sensitive: 1 })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return rows
    .filter((r) => !r.sensitive)
    .map((r) => ({
      ref: r.ref,
      status: r.status,
      category: r.category,
      createdAt: r.createdAt,
      supportCount: r.supportCount || 0,
      areaName: r.areaName,
      landmark: r.landmark || '',
      distanceM: Math.round(haversineM(lat, lng, r.location.coordinates[1], r.location.coordinates[0])),
    }));
}
