import { destination, type LatLng } from '../src/core/geo';
import type { Fix } from '../src/core/types';

export type Segment = { straight: number } | { turn: number; radius: number };

export type Path = { length: number; at: (s: number) => LatLng & { heading: number }; arcs: [number, number][] };

export function buildPath(start: LatLng, heading: number, segments: Segment[]): Path {
  const pts: (LatLng & { heading: number })[] = [{ ...start, heading }];
  const arcs: [number, number][] = [];
  let pos = start;
  let h = heading;
  for (const seg of segments) {
    if ('straight' in seg) {
      for (let i = 0; i < seg.straight; i++) {
        pos = destination(pos, h, 1);
        pts.push({ ...pos, heading: h });
      }
    } else {
      const len = Math.round((Math.abs(seg.turn) * Math.PI * seg.radius) / 180);
      const step = seg.turn / len;
      arcs.push([pts.length - 1, pts.length - 1 + len]);
      for (let i = 0; i < len; i++) {
        h = (h + step / 2 + 360) % 360;
        pos = destination(pos, h, 1);
        h = (h + step / 2 + 360) % 360;
        pts.push({ ...pos, heading: h });
      }
    }
  }
  const length = pts.length - 1;
  return {
    length,
    arcs,
    at: (s) => {
      const c = Math.max(0, Math.min(length, s));
      const i = Math.min(length - 1, Math.floor(c));
      const f = c - i;
      const a = pts[i];
      const b = pts[i + 1];
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, heading: f < 0.5 ? a.heading : b.heading };
    },
  };
}

export type Sim = {
  path: Path;
  speed: (t: number, s: number) => number;
  duration?: number;
  interval?: number;
  alt?: (s: number) => number | null;
  t0?: number;
};

export function simulate({ path, speed, duration = Infinity, interval = 1, alt, t0 = 1_760_000_000_000 }: Sim): Fix[] {
  const dt = 0.05;
  const fixes: Fix[] = [];
  let s = 0;
  let t = 0;
  let nextFix = 0;
  while (t <= duration + 1e-9) {
    const v = Math.max(0, speed(t, s));
    if (t >= nextFix - 1e-9) {
      const p = path.at(s);
      fixes.push({ t: Math.round(t0 + t * 1000), lat: p.lat, lng: p.lng, alt: alt ? alt(s) : null, speed: v, heading: v > 0.5 ? p.heading : null, acc: 5 });
      nextFix += interval;
    }
    if (s >= path.length && duration === Infinity) break;
    s = Math.min(path.length, s + v * dt);
    t += dt;
  }
  return fixes;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
}

export const MUNICH = { lat: 48.1374, lng: 11.5755 };
