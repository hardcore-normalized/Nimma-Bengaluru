// Official sign-in / sign-out / password change.
import express from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { Official } from '../models/index.js';
import { parse, HttpError, badRequest, clientIp } from '../lib/http.js';
import { signOfficial, clearOfficial, loadOfficial, requireOfficial } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';
import { DEMO_ACCOUNTS } from '../seed/accounts.js';

const router = express.Router();
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in 15 minutes.' } },
});

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain letters and numbers');

router.post('/login', loginLimiter, async (req, res) => {
  const body = parse(z.object({ username: z.string().trim().min(1, 'Enter your username').max(60), password: z.string().min(1, 'Enter your password').max(200) }), req.body);
  const o = await Official.findOne({ username: body.username.toLowerCase() });
  const fail = async (message, status = 401, code = 'BAD_LOGIN') => {
    await audit(req, 'LOGIN_FAILED', { targetType: 'official', targetId: o?._id, details: { username: body.username.slice(0, 40), reason: code } });
    throw new HttpError(status, code, message);
  };
  if (!o) {
    await bcrypt.compare(body.password, DUMMY_HASH); // same timing as a real check
    return fail('Wrong username or password.');
  }
  if (o.lockedUntil && o.lockedUntil > new Date()) {
    const mins = Math.ceil((o.lockedUntil - Date.now()) / 60000);
    return fail(`This account is locked after repeated wrong passwords. Try again in ${mins} minute(s).`, 423, 'LOCKED');
  }
  if (!o.active) return fail('This account has been deactivated. Contact the administrator.', 403, 'INACTIVE');
  if (o.role !== 'admin') return fail('Only the administrator account can sign in.', 403, 'NOT_ADMIN');
  const ok = await bcrypt.compare(body.password, o.passwordHash);
  if (!ok) {
    o.failedLogins = (o.failedLogins || 0) + 1;
    if (o.failedLogins >= 5) {
      o.lockedUntil = new Date(Date.now() + 15 * 60000);
      o.failedLogins = 0;
    }
    await o.save();
    return fail('Wrong username or password.');
  }
  o.failedLogins = 0;
  o.lockedUntil = undefined;
  o.lastLoginAt = new Date();
  o.lastLoginIp = clientIp(req);
  await o.save();
  signOfficial(res, req, o);
  req.official = o;
  await audit(req, 'LOGIN', { targetType: 'official', targetId: o._id });
  res.json({ official: o.toSafeJSON() });
});

router.post('/logout', async (req, res) => {
  const o = await loadOfficial(req);
  clearOfficial(res, req);
  if (o) {
    req.official = o;
    await audit(req, 'LOGOUT', { targetType: 'official', targetId: o._id });
  }
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  const o = await loadOfficial(req);
  res.json({ official: o ? o.toSafeJSON() : null });
});

router.post('/password', requireOfficial, async (req, res) => {
  const body = parse(z.object({ current: z.string().min(1).max(200), next: passwordSchema }), req.body);
  const o = req.official;
  if (!(await bcrypt.compare(body.current, o.passwordHash))) throw badRequest('Your current password is wrong.');
  if (body.current === body.next) throw badRequest('Choose a new password that is different from the current one.');
  o.passwordHash = await bcrypt.hash(body.next, 10);
  o.mustChangePassword = false;
  o.tokenVersion = (o.tokenVersion || 0) + 1;
  await o.save();
  signOfficial(res, req, o);
  await audit(req, 'PASSWORD_CHANGED', { targetType: 'official', targetId: o._id });
  res.json({ ok: true, official: o.toSafeJSON() });
});

// Demo accounts shown on the login page (only while their demo password is unchanged).
let demoCache = null;
let demoAt = 0;
router.get('/demo-accounts', async (req, res) => {
  const s = await getSettings();
  if (!s.showDemoLogins) return res.json({ items: [] });
  if (demoCache && Date.now() - demoAt < 60000) return res.json({ items: demoCache });
  const items = [];
  for (const d of DEMO_ACCOUNTS) {
    const o = await Official.findOne({ username: d.username, active: true });
    if (!o || !(await bcrypt.compare(d.password, o.passwordHash))) continue;
    const areas = 'All 369 wards';
    items.push({ username: d.username, password: d.password, name: o.name, designation: o.designation, role: o.role, areas });
  }
  demoCache = items;
  demoAt = Date.now();
  res.json({ items });
});

export default router;
