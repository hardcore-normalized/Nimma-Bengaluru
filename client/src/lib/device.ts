// Device detection and a light browser fingerprint (used only for misuse prevention –
// disclosed in the privacy notice).
export function isMobileDevice() {
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua) || iPadOS;
}

export function canUseCamera() {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
}

// Small non-cryptographic string hash (works on http pages too)
function cyrb53(str: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export interface Fingerprint {
  platform?: string;
  tz?: string;
  lang?: string;
  langs?: string;
  screen?: string;
  colorDepth?: number;
  cores?: number;
  memory?: number;
  touch?: number;
  canvas?: string;
  webgl?: string;
  mobile?: boolean;
}

let cached: Fingerprint | null = null;

export function fingerprint(): Fingerprint {
  if (cached) return cached;
  let canvasHash = '';
  try {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 60;
    const ctx = c.getContext('2d')!;
    ctx.textBaseline = 'top';
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(100, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Nimma Bengaluru ನಮ್ಮ 🛺', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Nimma Bengaluru ನಮ್ಮ 🛺', 4, 17);
    canvasHash = cyrb53(c.toDataURL());
  } catch {
    /* ignore */
  }
  let webgl = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl') as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      webgl = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).slice(0, 190);
    }
  } catch {
    /* ignore */
  }
  const nav = navigator as any;
  cached = {
    platform: String(nav.userAgentData?.platform || navigator.platform || '').slice(0, 60),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lang: navigator.language,
    langs: (navigator.languages || []).join(',').slice(0, 110),
    screen: `${screen.width}x${screen.height}@${Math.round((window.devicePixelRatio || 1) * 100) / 100}`,
    colorDepth: screen.colorDepth,
    cores: navigator.hardwareConcurrency || 0,
    memory: nav.deviceMemory || 0,
    touch: navigator.maxTouchPoints || 0,
    canvas: canvasHash,
    webgl,
    mobile: isMobileDevice(),
  };
  return cached;
}
