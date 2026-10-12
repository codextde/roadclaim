import type { DriveSummary, Fix } from '@/core/types';

export type LatLng = { latitude: number; longitude: number };

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number) {
  const y = Math.sin(rad(bLng - aLng)) * Math.cos(rad(bLat));
  const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat)) - Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLng - aLng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function lerpAngle(a: number, b: number, f: number) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * f + 360) % 360;
}

export const toLatLng = (p: { lat: number; lng: number }): LatLng => ({ latitude: p.lat, longitude: p.lng });

export function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}

export function isSampleDrive(d: Pick<DriveSummary, 'sample'>) {
  return d.sample === true;
}

export const SPEED_COLORS = ['#7C8A9A', '#2BB3A8', '#10B981', '#F2C14E', '#F59E0B'] as const;
const SPEED_STEPS_KMH = [30, 55, 85, 115];

export function speedColor(mps: number) {
  const kmh = mps * 3.6;
  const i = SPEED_STEPS_KMH.findIndex((s) => kmh < s);
  return SPEED_COLORS[i === -1 ? SPEED_COLORS.length - 1 : i];
}

export function fixSpeeds(fixes: Fix[]) {
  return fixes.map((f, i) => {
    if (f.speed != null && f.speed >= 0) return f.speed;
    const a = fixes[Math.max(0, i - 1)];
    const b = fixes[Math.min(fixes.length - 1, i + 1)];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? distanceM(a.lat, a.lng, b.lat, b.lng) / dt : 0;
  });
}

export function speedPolyline(fixes: Fix[], max = 900) {
  const speeds = fixSpeeds(fixes);
  const idx = thin(
    fixes.map((_, i) => i),
    max,
  );
  return {
    coords: idx.map((i) => toLatLng(fixes[i])),
    colors: idx.map((i) => {
      const lo = Math.max(0, i - 3);
      const hi = Math.min(speeds.length, i + 4);
      let s = 0;
      for (let k = lo; k < hi; k++) s += speeds[k];
      return speedColor(s / (hi - lo));
    }),
  };
}

export type Sample = { lat: number; lng: number; d: number; t: number; speed: number; heading: number };

export function resample(fixes: Fix[], target = 700): Sample[] {
  if (fixes.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < fixes.length; i++) cum.push(cum[i - 1] + distanceM(fixes[i - 1].lat, fixes[i - 1].lng, fixes[i].lat, fixes[i].lng));
  const total = cum[cum.length - 1];
  if (total < 1) return [];
  const speeds = fixSpeeds(fixes);
  const n = Math.max(2, Math.min(target, Math.ceil(total / 4)));
  const step = total / (n - 1);
  const out: Sample[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = Math.min(total, k * step);
    while (j < fixes.length - 2 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j];
    const f = seg > 0 ? (d - cum[j]) / seg : 0;
    const a = fixes[j];
    const b = fixes[j + 1];
    out.push({
      lat: a.lat + (b.lat - a.lat) * f,
      lng: a.lng + (b.lng - a.lng) * f,
      d,
      t: a.t + (b.t - a.t) * f,
      speed: speeds[j] + (speeds[j + 1] - speeds[j]) * f,
      heading: 0,
    });
  }
  const look = Math.max(1, Math.round(60 / step));
  const raw = out.map((_, i) => {
    const a = out[Math.max(0, i - look)];
    const b = out[Math.min(out.length - 1, i + look)];
    return bearingDeg(a.lat, a.lng, b.lat, b.lng);
  });
  const win = Math.max(2, Math.round(140 / step));
  for (let i = 0; i < out.length; i++) {
    let x = 0;
    let y = 0;
    for (let k = Math.max(0, i - win); k <= Math.min(out.length - 1, i + win); k++) {
      x += Math.cos(rad(raw[k]));
      y += Math.sin(rad(raw[k]));
    }
    out[i].heading = (deg(Math.atan2(y, x)) + 360) % 360;
  }
  return out;
}

export function destination(lat: number, lng: number, bearing: number, dist: number) {
  const dr = dist / R;
  const b = rad(bearing);
  const la = rad(lat);
  const lat2 = Math.asin(Math.sin(la) * Math.cos(dr) + Math.cos(la) * Math.sin(dr) * Math.cos(b));
  const lng2 = rad(lng) + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(la), Math.cos(dr) - Math.sin(la) * Math.sin(lat2));
  return { latitude: deg(lat2), longitude: deg(lng2) };
}

export function projectRoutes(routes: [number, number][][], width: number, height: number, pad: number) {
  const all = routes.flat();
  if (all.length < 2) return [];
  const midLat = all.reduce((s, p) => s + p[0], 0) / all.length;
  const kx = Math.cos(rad(midLat));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [lat, lng] of all) {
    minX = Math.min(minX, lng * kx);
    maxX = Math.max(maxX, lng * kx);
    minY = Math.min(minY, -lat);
    maxY = Math.max(maxY, -lat);
  }
  const scale = 1 / Math.max((maxX - minX) / (width - 2 * pad), (maxY - minY) / (height - 2 * pad), 1e-9);
  const ox = (width - (maxX - minX) * scale) / 2;
  const oy = (height - (maxY - minY) * scale) / 2;
  return routes
    .filter((r) => r.length >= 2)
    .map((r) => r.map(([lat, lng], i) => `${i === 0 ? 'M' : 'L'}${(ox + (lng * kx - minX) * scale).toFixed(1)},${(oy + (-lat - minY) * scale).toFixed(1)}`).join(''));
}

export function hexGridPath(width: number, height: number, size: number) {
  const w = Math.sqrt(3) * size;
  const h = 1.5 * size;
  let d = '';
  for (let row = -1; row * h < height + size; row++) {
    for (let col = -1; col * w < width + w; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0);
      const cy = row * h;
      for (let i = 0; i < 6; i++) {
        const a = rad(60 * i - 30);
        d += `${i === 0 ? 'M' : 'L'}${(cx + size * Math.cos(a)).toFixed(1)},${(cy + size * Math.sin(a)).toFixed(1)}`;
      }
      d += 'Z';
    }
  }
  return d;
}

export function placeLine(d: Pick<DriveSummary, 'startPlace' | 'endPlace' | 'city'>) {
  if (d.startPlace && d.endPlace && d.startPlace !== d.endPlace) return `${d.startPlace} → ${d.endPlace}`;
  return d.startPlace ?? d.endPlace ?? d.city ?? null;
}

export function parseDay(key: string) {
  const [y, m, day] = key.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}
