// Generates clearly-labelled illustrative "DEMO PHOTO" images (SVG) for seeded reports.
const COLORS = {
  roads: ['#64748b', '#1e293b'],
  waste: ['#84cc16', '#3f6212'],
  water: ['#38bdf8', '#0c4a6e'],
  power: ['#fbbf24', '#78350f'],
  green: ['#4ade80', '#14532d'],
  safety: ['#f87171', '#7f1d1d'],
  buildings: ['#c084fc', '#4c1d95'],
  governance: ['#94a3b8', '#0f172a'],
  other: ['#818cf8', '#312e81'],
  after: ['#34d399', '#065f46'],
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function demoSvg({ group, emoji, title, subtitle, lat, lng, ward, when, after = false }) {
  const [c1, c2] = COLORS[after ? 'after' : group] || COLORS.other;
  const date = new Date(when).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const font = "Arial, Helvetica, sans-serif";
  const emojiFont = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<radialGradient id="v" cx="0.5" cy="0.42" r="0.8"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient>
</defs>
<rect width="1200" height="900" fill="url(#g)"/>
<path d="M0 575 L1200 530 L1200 900 L0 900 Z" fill="#000" opacity="0.2"/>
<path d="M520 900 L585 560 L615 560 L680 900 Z" fill="#fff" opacity="0.07"/>
<circle cx="600" cy="390" r="235" fill="#fff" opacity="0.09"/>
<text x="600" y="475" font-size="250" text-anchor="middle" font-family="${emojiFont}">${esc(after ? '✅' : emoji)}</text>
<rect width="1200" height="900" fill="url(#v)"/>
<rect x="36" y="36" rx="14" width="262" height="58" fill="#000" opacity="0.5"/>
<text x="167" y="75" font-size="26" fill="#fff" text-anchor="middle" font-family="${font}" font-weight="700" letter-spacing="3">DEMO PHOTO</text>
<text x="600" y="660" font-size="46" fill="#fff" text-anchor="middle" font-family="${font}" font-weight="700">${esc(after ? 'After: issue fixed' : title)}</text>
<text x="600" y="712" font-size="28" fill="#fff" opacity="0.88" text-anchor="middle" font-family="${font}">${esc(subtitle || '')}</text>
<rect x="0" y="800" width="1200" height="100" fill="#000" opacity="0.6"/>
<text x="32" y="842" font-size="26" fill="#fff" font-family="${font}">${esc(`GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}  ·  ${ward}`)}</text>
<text x="32" y="880" font-size="24" fill="#fff" opacity="0.85" font-family="${font}">${esc(`${date} IST  ·  Nimma Bengaluru  ·  sample data for demonstration`)}</text>
</svg>`;
}
