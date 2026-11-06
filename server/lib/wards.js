// GBA ward boundaries (369 wards, 5 city corporations, 2025 delimitation).
// Source: Greater Bengaluru Authority, via OpenCity (data.opencity.in) – public domain.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../env.js';

const detailed = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data', 'wards.geojson'), 'utf8'));
const display = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data', 'wards-display.geojson'), 'utf8'));

export const WARD_ATTRIBUTION = detailed.attribution;

function polygonsOf(geometry) {
  return geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
}

function bboxOf(polys) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

const index = detailed.features.map((f) => {
  const polys = polygonsOf(f.geometry);
  return { props: f.properties, polys, bbox: bboxOf(polys) };
});

export const WARDS = index.map((w) => w.props);
export const WARD_BY_CODE = Object.fromEntries(WARDS.map((w) => [w.code, w]));
const DISPLAY_BY_CODE = Object.fromEntries(display.features.map((f) => [f.properties.code, f]));

// Corporation → zone → wards tree (used by the admin "assign areas" screen)
export const CORPORATIONS = (() => {
  const order = ['Central', 'East', 'North', 'South', 'West'];
  const map = new Map();
  for (const w of WARDS) {
    if (!map.has(w.corporation)) {
      map.set(w.corporation, { name: w.corporation, zones: new Map(), wardCount: 0 });
    }
    const c = map.get(w.corporation);
    c.wardCount++;
    if (!c.zones.has(w.zone)) c.zones.set(w.zone, []);
    c.zones.get(w.zone).push(w.code);
  }
  return order
    .filter((n) => map.has(n))
    .map((n) => {
      const c = map.get(n);
      return {
        name: `Bengaluru ${c.name} City Corporation`,
        key: c.name,
        wardCount: c.wardCount,
        zones: [...c.zones.entries()].map(([zone, codes]) => ({ name: zone, codes })),
      };
    });
})();

// Ray-casting point-in-ring test. pt = [lng, lat]
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygons(pt, polys) {
  for (const poly of polys) {
    if (!inRing(pt, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (inRing(pt, poly[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Distance (metres, approx.) from a point to the nearest polygon edge.
function distanceToPolys([x, y], polys) {
  const kx = 111320 * Math.cos((y * Math.PI) / 180);
  const ky = 110540;
  let best = Infinity;
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const ax = ring[i][0] * kx, ay = ring[i][1] * ky;
        const bx = ring[i + 1][0] * kx, by = ring[i + 1][1] * ky;
        const px = x * kx, py = y * ky;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
        const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/**
 * Find the GBA ward for a coordinate. Returns ward properties or null when the
 * point is outside the Bengaluru (GBA) service area. Points within `snapM`
 * metres of a boundary (e.g. small gaps between ward shapes) snap to the nearest ward.
 */
export function findWard(lat, lng, snapM = 250) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const pt = [lng, lat];
  for (const w of index) {
    const [a, b, c, d] = w.bbox;
    if (lng < a || lng > c || lat < b || lat > d) continue;
    if (inPolygons(pt, w.polys)) return w.props;
  }
  let best = null;
  let bestD = Infinity;
  const pad = 0.01;
  for (const w of index) {
    const [a, b, c, d] = w.bbox;
    if (lng < a - pad || lng > c + pad || lat < b - pad || lat > d + pad) continue;
    const dist = distanceToPolys(pt, w.polys);
    if (dist < bestD) {
      bestD = dist;
      best = w.props;
    }
  }
  return bestD <= snapM ? best : null;
}

export function wardFeature(code) {
  return DISPLAY_BY_CODE[code] || null;
}

export function wardFeatures(codes) {
  const list = codes ? codes.map((c) => DISPLAY_BY_CODE[c]).filter(Boolean) : display.features;
  return { type: 'FeatureCollection', features: list };
}

// Overall service bounding box (for map defaults)
export const SERVICE_BBOX = (() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of index) {
    minX = Math.min(minX, w.bbox[0]);
    minY = Math.min(minY, w.bbox[1]);
    maxX = Math.max(maxX, w.bbox[2]);
    maxY = Math.max(maxY, w.bbox[3]);
  }
  return [minX, minY, maxX, maxY];
})();

export const CITY_CENTER = { lat: 12.9716, lng: 77.5946 };
