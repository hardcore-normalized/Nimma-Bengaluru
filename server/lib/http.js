// Small HTTP helpers: typed errors, request metadata, validation.
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details);
export const forbidden = (message = 'You do not have permission to do this.') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'NOT_FOUND', message);
export const tooMany = (message, details) => new HttpError(429, 'RATE_LIMITED', message, details);

// Validate with a zod schema and throw a friendly 400 on failure.
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const first = issues[0];
    throw badRequest(first ? `${first.field ? first.field + ': ' : ''}${first.message}` : 'Invalid input', issues);
  }
  return r.data;
}

export function clientIp(req) {
  // Express resolves X-Forwarded-For only when the request came through a local
  // tunnel (trust proxy = loopback), so this cannot be spoofed from the Wi-Fi.
  let ip = req.ip || req.socket?.remoteAddress || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

export function isLoopback(req) {
  const a = req.socket?.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

export function userAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 400);
}

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function maskPhone(phone) {
  if (!phone) return '';
  const p = String(phone);
  return p.length >= 10 ? `${p.slice(0, 2)}******${p.slice(-2)}` : '******';
}

// Normalise an Indian mobile number to 10 digits, or return null.
export function normalisePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
