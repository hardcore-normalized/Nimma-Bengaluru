// Admin-editable anti-misuse and portal settings (stored in MongoDB).
import { Setting } from '../models/index.js';

export const SETTING_DEFS = {
  maxReportsPerDay: { def: 5, min: 1, max: 50, label: 'Max reports per mobile number per day' },
  maxReportsPerHour: { def: 3, min: 1, max: 20, label: 'Max reports per mobile number per hour' },
  cooldownMinutes: { def: 2, min: 0, max: 60, label: 'Minimum minutes between two reports' },
  maxReportsPerDevicePerDay: { def: 8, min: 1, max: 100, label: 'Max reports per phone/device per day' },
  requireDeviceLocation: { def: true, label: 'Reporter must share live GPS location' },
  maxPinDistanceM: { def: 500, min: 50, max: 5000, label: 'Max distance (m) between reporter and issue pin' },
  allowGalleryUploads: { def: false, label: 'Allow photos from gallery (not recommended)' },
  autoBlockStrikes: { def: 3, min: 1, max: 10, label: 'Strikes before automatic temporary block' },
  autoBlockDays: { def: 30, min: 1, max: 365, label: 'Automatic block duration (days)' },
  permanentBlockStrikes: { def: 5, min: 2, max: 20, label: 'Strikes before permanent block' },
  sensitiveIntakeEnabled: { def: false, label: 'Accept confidential allegations (enable only after an approved review and referral process exists)' },
  showDemoLogins: { def: true, label: 'Show demo accounts on the official login page' },
  maxPhotos: { def: 4, min: 1, max: 6, label: 'Max photos per report' },
  maxVideoSeconds: { def: 20, min: 5, max: 60, label: 'Max video length (seconds)' },
  firewallEnabled: { def: true, label: 'Firewall on (blocks floods, scanners and attack requests)' },
  fwRequestsPerMinute: { def: 240, min: 60, max: 3000, label: 'Firewall: max requests per minute from one network (IP)' },
  fwBanMinutes: { def: 60, min: 5, max: 10080, label: 'Firewall: first automatic ban length (minutes; repeat offenders get longer bans)' },
  duplicateRadiusM: { def: 75, min: 10, max: 500, label: 'Radius (m) for nearby-duplicate detection' },
};

export const DEFAULT_SETTINGS = Object.fromEntries(Object.entries(SETTING_DEFS).map(([k, v]) => [k, v.def]));

let cache = null;
let cacheAt = 0;

export async function getSettings() {
  if (cache && Date.now() - cacheAt < 5000) return cache;
  const doc = await Setting.findById('global').lean();
  cache = { ...DEFAULT_SETTINGS, ...((doc && doc.values) || {}) };
  cacheAt = Date.now();
  return cache;
}

export function sanitiseSettings(patch) {
  const out = {};
  for (const [k, def] of Object.entries(SETTING_DEFS)) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (typeof def.def === 'boolean') out[k] = Boolean(v);
    else {
      const n = Math.round(Number(v));
      if (Number.isFinite(n)) out[k] = Math.min(def.max, Math.max(def.min, n));
    }
  }
  return out;
}

export async function updateSettings(patch) {
  const current = await getSettings();
  const values = { ...current, ...sanitiseSettings(patch) };
  await Setting.updateOne({ _id: 'global' }, { $set: { values } }, { upsert: true });
  cache = null;
  return getSettings();
}
