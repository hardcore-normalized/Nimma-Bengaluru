// Image helpers: burn a GPS/time watermark into photos and compress them.
import exifr from 'exifr';

export interface CapturedMedia {
  id: string;
  kind: 'image' | 'video';
  blob: Blob;
  url: string;
  captureMethod: 'live' | 'native' | 'gallery';
  capturedAt: string;
  gps?: { lat: number; lng: number; accuracy: number } | null;
  exifDate?: string | null;
  exifLat?: number | null;
  exifLng?: number | null;
  width?: number;
  height?: number;
  durationSec?: number;
  thumb?: string;
}

export interface StampInfo {
  lat?: number;
  lng?: number;
  accuracy?: number;
  ward?: string;
  label?: string;
}

const MAX_SIDE = 1600;

export function istString(d = new Date()) {
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
}

export function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, info: StampInfo, when = new Date()) {
  const fs = Math.max(13, Math.round(w * 0.021));
  const pad = Math.round(fs * 0.9);
  const lines = [
    info.lat != null && info.lng != null ? `GPS ${info.lat.toFixed(6)}, ${info.lng.toFixed(6)}  (±${Math.round(info.accuracy || 0)} m)` : 'GPS not available',
    `${info.ward ? info.ward + ' · ' : ''}Bengaluru`,
    `${istString(when)} · ${info.label || 'Nimma Bengaluru live camera'}`,
  ];
  const boxH = pad * 2 + lines.length * fs * 1.4;
  const g = ctx.createLinearGradient(0, h - boxH - pad * 2, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, h - boxH - pad * 2, w, boxH + pad * 2);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 700 : 500} ${fs}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    ctx.fillText(line, pad, h - boxH + pad + fs * (i + 1) * 1.35 - fs * 0.2);
  });
  // brand tag
  ctx.font = `800 ${Math.round(fs * 0.85)}px system-ui, sans-serif`;
  const tag = 'NIMMA BENGALURU';
  const tw = ctx.measureText(tag).width;
  ctx.fillStyle = 'rgba(124, 92, 255, 0.85)';
  const th = fs * 1.5;
  ctx.fillRect(w - tw - pad * 3, pad, tw + pad * 2, th);
  ctx.fillStyle = '#fff';
  ctx.fillText(tag, w - tw - pad * 2, pad + th * 0.7);
}

function toBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/jpeg', quality));
}

/** Grab the current video frame as a watermarked JPEG. */
export async function frameToJpeg(video: HTMLVideoElement, info: StampInfo) {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.min(1, MAX_SIDE / Math.max(vw, vh));
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, w, h);
  drawStamp(ctx, w, h, info);
  const blob = await toBlob(canvas);
  return { blob, width: w, height: h };
}

/** A small thumbnail of the current video frame (data URL). */
export function frameThumb(video: HTMLVideoElement) {
  const c = document.createElement('canvas');
  const s = 240 / Math.max(video.videoWidth || 240, video.videoHeight || 240);
  c.width = Math.round((video.videoWidth || 240) * s);
  c.height = Math.round((video.videoHeight || 240) * s);
  c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

/** Photo taken with the phone's own camera app (fallback): read EXIF, compress, stamp. */
export async function processNativePhoto(file: File, info: StampInfo, method: 'native' | 'gallery') {
  let exifDate: string | null = null;
  let exifLat: number | null = null;
  let exifLng: number | null = null;
  try {
    const tags: any = await exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef'] });
    const d = tags?.DateTimeOriginal || tags?.CreateDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) exifDate = d.toISOString();
    if (typeof tags?.latitude === 'number') exifLat = tags.latitude;
    if (typeof tags?.longitude === 'number') exifLng = tags.longitude;
  } catch {
    /* no EXIF */
  }
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
  } catch {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This photo format is not supported. Please use the camera.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const bw = (bitmap as any).width;
  const bh = (bitmap as any).height;
  const scale = Math.min(1, MAX_SIDE / Math.max(bw, bh));
  const w = Math.round(bw * scale);
  const h = Math.round(bh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap as any, 0, 0, w, h);
  drawStamp(ctx, w, h, { ...info, label: method === 'gallery' ? 'from gallery' : `phone camera${exifDate ? ' · taken ' + istString(new Date(exifDate)) : ''}` });
  const blob = await toBlob(canvas);
  return { blob, width: w, height: h, exifDate, exifLat, exifLng };
}

export function pickVideoMime() {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return null;
  return types.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  }) || '';
}

export const uid = () => Math.random().toString(36).slice(2, 10);
