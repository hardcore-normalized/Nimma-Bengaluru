// Authentication & authorisation.
//  - Officials: username + password -> signed JWT in an httpOnly cookie.
//  - Citizens: no account; self-reported contact session -> short-lived token bound to the device.
//  - Every browser gets a signed device-id cookie (used to trace misuse).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../env.js';
import { Official, Reporter } from '../models/index.js';
import { HttpError, forbidden, isLoopback } from './http.js';

const OFFICIAL_COOKIE = 'nb_off';
const CITIZEN_COOKIE = 'nb_cit';
const DEVICE_COOKIE = 'nb_dev';

function cookieOpts(req, maxAgeMs) {
  return { httpOnly: true, sameSite: 'lax', secure: Boolean(req.secure), maxAge: maxAgeMs, path: '/' };
}

// ---------- device id ----------
export function deviceMiddleware(req, res, next) {
  let id = req.signedCookies?.[DEVICE_COOKIE];
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    res.cookie(DEVICE_COOKIE, id, { ...cookieOpts(req, 1000 * 60 * 60 * 24 * 730), signed: true });
    req.newDevice = true;
  }
  req.deviceId = id;
  next();
}

// ---------- officials ----------
export function signOfficial(res, req, official) {
  const token = jwt.sign({ sub: String(official._id), role: official.role, tv: official.tokenVersion || 0, typ: 'off' }, config.secret, {
    expiresIn: '10h',
  });
  res.cookie(OFFICIAL_COOKIE, token, cookieOpts(req, 1000 * 60 * 60 * 10));
}

export function clearOfficial(res, req) {
  res.clearCookie(OFFICIAL_COOKIE, { path: '/', sameSite: 'lax', secure: Boolean(req.secure), httpOnly: true });
}

export async function loadOfficial(req) {
  const token = req.cookies?.[OFFICIAL_COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.secret);
    if (p.typ !== 'off') return null;
    const o = await Official.findById(p.sub);
    if (!o || !o.active || o.role !== 'admin' || (o.tokenVersion || 0) !== p.tv) return null;
    return o;
  } catch {
    return null;
  }
}

export async function requireOfficial(req, res, next) {
  const o = await loadOfficial(req);
  if (!o) return next(new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to the official portal.'));
  req.official = o;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.official?.role !== 'admin') return next(forbidden('Only the administrator can do this.'));
  next();
}

// ---------- citizens ----------
export function signCitizen(res, req, reporter) {
  const token = jwt.sign({ sub: String(reporter._id), ph: reporter.phone, did: req.deviceId, typ: 'cit' }, config.secret, { expiresIn: '12h' });
  res.cookie(CITIZEN_COOKIE, token, cookieOpts(req, 1000 * 60 * 60 * 12));
}

export function clearCitizen(res, req) {
  res.clearCookie(CITIZEN_COOKIE, { path: '/', sameSite: 'lax', secure: Boolean(req.secure), httpOnly: true });
}

export async function loadCitizen(req) {
  const token = req.cookies?.[CITIZEN_COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.secret);
    // A contact session is valid only on the same device where it was started.
    if (p.typ !== 'cit' || p.did !== req.deviceId) return null;
    return await Reporter.findById(p.sub);
  } catch {
    return null;
  }
}

export async function optionalCitizen(req, res, next) {
  req.citizen = await loadCitizen(req);
  next();
}

export async function requireCitizen(req, res, next) {
  const c = await loadCitizen(req);
  if (!c) return next(new HttpError(401, 'START_SESSION', 'Enter your contact details to continue.'));
  req.citizen = c;
  next();
}

// ---------- scope: which reports an official may see ----------
export function scopeFilter(official) {
  if (official.role === 'admin') return {};
  const f = { area: { $in: official.areas || [] } };
  if (official.categories?.length) f.category = { $in: official.categories };
  if (!official.canViewSensitive) f.sensitive = { $ne: true };
  return f;
}

export function canAccessReport(official, report) {
  if (official.role === 'admin') return true;
  if (!(official.areas || []).includes(report.area)) return false;
  if (official.categories?.length && !official.categories.includes(report.category)) return false;
  if (report.sensitive && !official.canViewSensitive) return false;
  return true;
}

// ---------- CSRF guard ----------
// State-changing API calls must carry a custom header. Browsers cannot add it to
// cross-site requests without a CORS pre-flight (which this server never allows).
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-nb-client') === '1') return next();
  next(forbidden('Request blocked (missing client header).'));
}

export { isLoopback };
