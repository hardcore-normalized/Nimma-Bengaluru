// Blocking misusers: by mobile number, device, browser fingerprint or IP.
import { Block, Reporter } from '../models/index.js';
import { getSettings } from './settings.js';

export async function findActiveBlock({ phone, deviceId, fpHash, ip }) {
  const or = [];
  if (phone) or.push({ type: 'phone', value: phone });
  if (deviceId) or.push({ type: 'device', value: deviceId });
  if (fpHash) or.push({ type: 'fingerprint', value: fpHash });
  if (ip) or.push({ type: 'ip', value: ip });
  if (!or.length) return null;
  const now = new Date();
  return Block.findOne({
    active: true,
    $and: [{ $or: or }, { $or: [{ until: null }, { until: { $gt: now } }] }],
  })
    .sort({ until: -1 })
    .lean();
}

export function blockPayload(block) {
  const until = block.until ? new Date(block.until) : null;
  return {
    code: 'BLOCKED',
    message: until
      ? `Reporting is blocked for this ${block.type === 'phone' ? 'mobile number' : 'device'} until ${until.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} because of misuse.`
      : `Reporting is permanently blocked for this ${block.type === 'phone' ? 'mobile number' : 'device'} because of repeated misuse.`,
    reason: block.reason || '',
    until,
    blockedType: block.type,
  };
}

/**
 * Block a reporter: their phone number plus the given devices / fingerprints.
 * days = null → permanent.
 */
export async function blockReporter({ reporter, deviceIds = [], fpHashes = [], days, reason, relatedRef, by, auto = false, isDemo = false }) {
  const until = days ? new Date(Date.now() + days * 86400000) : null;
  const targets = [
    { type: 'phone', value: reporter.phone },
    ...[...new Set(deviceIds.filter(Boolean))].map((v) => ({ type: 'device', value: v })),
    ...[...new Set(fpHashes.filter(Boolean))].map((v) => ({ type: 'fingerprint', value: v })),
  ];
  const docs = [];
  for (const t of targets) {
    // Replace an existing active block on the same target with the new one
    await Block.updateMany({ ...t, active: true }, { $set: { active: false, liftedAt: new Date(), liftedBy: 'replaced' } });
    docs.push(
      await Block.create({
        ...t,
        reason,
        reporter: reporter._id,
        relatedRef,
        until,
        auto,
        by: by?._id,
        byName: by?.name || (auto ? 'System (automatic)' : 'System'),
        isDemo,
      })
    );
  }
  return { until, blocks: docs };
}

export async function liftBlocksForReporter(reporter, liftedBy) {
  const deviceIds = (reporter.devices || []).map((d) => d.deviceId);
  const fps = (reporter.devices || []).map((d) => d.fpHash).filter(Boolean);
  const r = await Block.updateMany(
    {
      active: true,
      $or: [{ reporter: reporter._id }, { type: 'phone', value: reporter.phone }, { type: 'device', value: { $in: deviceIds } }, { type: 'fingerprint', value: { $in: fps } }],
    },
    { $set: { active: false, liftedAt: new Date(), liftedBy } }
  );
  return r.modifiedCount || 0;
}

/**
 * After a misuse strike: when the strike threshold is reached, automatically block
 * the mobile number AND the phone/browser used for the fake report, so the person
 * cannot simply insert another SIM. Officials/admin can lift it from the blocklist.
 */
export async function applyAutoBlock(reporter, { deviceIds = [], fpHashes = [], relatedRef }) {
  const s = await getSettings();
  const since = Date.now() - 180 * 86400000;
  const strikes = (reporter.strikes || []).filter((x) => !x.revoked && new Date(x.at).getTime() > since).length;
  if (strikes >= s.permanentBlockStrikes) {
    return blockReporter({ reporter, deviceIds, fpHashes, days: null, reason: `${strikes} misuse strikes (automatic permanent block)`, relatedRef, auto: true });
  }
  if (strikes >= s.autoBlockStrikes) {
    return blockReporter({ reporter, deviceIds, fpHashes, days: s.autoBlockDays, reason: `${strikes} misuse strikes (automatic block)`, relatedRef, auto: true });
  }
  return null;
}

export function reporterBlockStatus(reporter) {
  return findActiveBlock({ phone: reporter.phone });
}

export { Reporter };
