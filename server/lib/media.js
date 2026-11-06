// Media handling: file-signature checks, hashing, GridFS storage and streaming.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import jpeg from 'jpeg-js';
import { mediaBucket } from '../db.js';
import { notFound } from './http.js';
import { countMediaIn, countMediaOut } from './usage.js';

export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

// Identify the real file type from its first bytes (never trust the browser's MIME type).
export function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (brand === 'qt  ') return 'video/quicktime';
    if (/^(heic|heix|hevc|hevx|mif1|msf1|avif)/.test(brand)) return 'image/heic';
    return 'video/mp4';
  }
  return null;
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// 64-bit difference hash ("dHash") of a JPEG. Two photos of the same scene / the
// same photo re-saved get hashes with a small Hamming distance.
export function dhash(buf) {
  try {
    const img = jpeg.decode(buf, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: true,
      maxResolutionInMP: 60,
      maxMemoryUsageInMB: 600,
    });
    const { width: W, height: H, data } = img;
    const gw = 9;
    const gh = 8;
    const gray = new Float64Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const x0 = Math.floor((gx * W) / gw);
        const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * W) / gw));
        const y0 = Math.floor((gy * H) / gh);
        const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * H) / gh));
        const sx = Math.max(1, Math.floor((x1 - x0) / 24));
        const sy = Math.max(1, Math.floor((y1 - y0) / 24));
        let sum = 0;
        let n = 0;
        for (let y = y0; y < y1; y += sy) {
          for (let x = x0; x < x1; x += sx) {
            const i = (y * W + x) * 4;
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            n++;
          }
        }
        gray[gy * gw + gx] = sum / n;
      }
    }
    let hex = '';
    let nibble = 0;
    let bits = 0;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw - 1; x++) {
        nibble = (nibble << 1) | (gray[y * gw + x] > gray[y * gw + x + 1] ? 1 : 0);
        if (++bits === 4) {
          hex += nibble.toString(16);
          nibble = 0;
          bits = 0;
        }
      }
    }
    return { hash: hex, width: W, height: H };
  } catch {
    return null;
  }
}

export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export function saveFile(buf, { filename, contentType, metadata }) {
  return new Promise((resolve, reject) => {
    const stream = mediaBucket().openUploadStream(filename, { contentType, metadata });
    stream.on('error', reject);
    stream.on('finish', () => {
      countMediaIn(buf.length); // database transfer estimate (free-tier monitor)
      resolve(stream.id);
    });
    stream.end(buf);
  });
}

export async function deleteFile(id) {
  try {
    await mediaBucket().delete(new mongoose.Types.ObjectId(String(id)));
  } catch {
    /* already gone */
  }
}

// Stream a stored file, with HTTP Range support (needed for video seeking on iPhone).
export async function streamFile(fileId, req, res, mime) {
  const bucket = mediaBucket();
  const _id = new mongoose.Types.ObjectId(String(fileId));
  const [file] = await bucket.find({ _id }).toArray();
  if (!file) throw notFound('File not found');
  const total = file.length;
  res.setHeader('Content-Type', mime || file.contentType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");

  let start = 0;
  let end = total - 1;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (m) {
      if (m[1] === '' && m[2] !== '') {
        start = Math.max(0, total - parseInt(m[2], 10));
      } else {
        start = parseInt(m[1] || '0', 10);
        if (m[2] !== '') end = Math.min(parseInt(m[2], 10), total - 1);
      }
    }
    if (!m || start >= total || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`);
      res.end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  }
  res.setHeader('Content-Length', end - start + 1);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = bucket.openDownloadStream(_id, range ? { start, end: end + 1 } : undefined);
  countMediaOut(end - start + 1); // database transfer estimate (free-tier monitor)
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
