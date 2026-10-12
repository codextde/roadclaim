import { angleDiff, bearing, destination, haversine, type LatLng } from '@/core/geo';
import { cellsFor, computeMetrics, simplify } from '@/core/metrics';
import type { Drive, Fix } from '@/core/types';

type Kind = 'city' | 'motorway' | 'pass';

type Route = {
  id: string;
  kind: Kind;
  vmax: number;
  from: string;
  to: string;
  city: string;
  cc: string;
  points: [number, number, number][];
};

const ROUTES: Route[] = [
  {
    id: 'schwabing',
    kind: 'city',
    vmax: 14,
    from: 'Schwabing',
    to: 'Altstadt',
    city: 'Munich',
    cc: 'DE',
    points: [
      [48.1617, 11.5862, 519],
      [48.1585, 11.5851, 518],
      [48.155, 11.5839, 518],
      [48.1517, 11.5823, 517],
      [48.148, 11.58, 517],
      [48.1426, 11.5775, 518],
      [48.1398, 11.5779, 519],
      [48.1372, 11.5755, 519],
    ],
  },
  {
    id: 'mittlerer-ring',
    kind: 'city',
    vmax: 17,
    from: 'Bogenhausen',
    to: 'Milbertshofen',
    city: 'Munich',
    cc: 'DE',
    points: [
      [48.158, 11.6185, 512],
      [48.144, 11.615, 525],
      [48.134, 11.611, 528],
      [48.1215, 11.6195, 532],
      [48.1155, 11.6005, 540],
      [48.1105, 11.569, 545],
      [48.1155, 11.545, 541],
      [48.118, 11.534, 538],
      [48.1305, 11.5335, 530],
      [48.144, 11.533, 524],
      [48.16, 11.537, 516],
      [48.1705, 11.5465, 511],
      [48.177, 11.56, 508],
    ],
  },
  {
    id: 'starnberg',
    kind: 'motorway',
    vmax: 33,
    from: 'Sendling',
    to: 'Starnberg',
    city: 'Munich',
    cc: 'DE',
    points: [
      [48.124, 11.525, 545],
      [48.108, 11.508, 556],
      [48.09, 11.49, 563],
      [48.067, 11.462, 575],
      [48.045, 11.425, 590],
      [48.02, 11.38, 610],
      [48.0055, 11.352, 600],
      [47.999, 11.34, 587],
    ],
  },
  {
    id: 'airport',
    kind: 'motorway',
    vmax: 36,
    from: 'Schwabing',
    to: 'Munich Airport',
    city: 'Munich',
    cc: 'DE',
    points: [
      [48.17, 11.59, 510],
      [48.188, 11.6, 503],
      [48.203, 11.61, 495],
      [48.228, 11.632, 484],
      [48.25, 11.65, 478],
      [48.285, 11.69, 466],
      [48.32, 11.73, 455],
      [48.3405, 11.756, 450],
      [48.3535, 11.7765, 448],
    ],
  },
  {
    id: 'englischer-garten',
    kind: 'city',
    vmax: 13,
    from: 'Maxvorstadt',
    to: 'Bogenhausen',
    city: 'Munich',
    cc: 'DE',
    points: [
      [48.1495, 11.5675, 519],
      [48.1505, 11.5765, 518],
      [48.1495, 11.5862, 515],
      [48.1468, 11.5905, 512],
      [48.1435, 11.6005, 513],
      [48.1408, 11.6075, 520],
      [48.1395, 11.613, 524],
    ],
  },
  {
    id: 'feuerbach',
    kind: 'city',
    vmax: 15,
    from: 'Stuttgart-Mitte',
    to: 'Feuerbach',
    city: 'Stuttgart',
    cc: 'DE',
    points: [
      [48.7784, 9.18, 247],
      [48.7835, 9.1845, 255],
      [48.791, 9.1865, 270],
      [48.799, 9.184, 292],
      [48.804, 9.182, 309],
      [48.8075, 9.1745, 302],
      [48.8105, 9.167, 296],
      [48.813, 9.16, 290],
    ],
  },
  {
    id: 'weinsteige',
    kind: 'pass',
    vmax: 14,
    from: 'Stuttgart-Süd',
    to: 'Degerloch',
    city: 'Stuttgart',
    cc: 'DE',
    points: [
      [48.764, 9.169, 268],
      [48.7605, 9.1725, 290],
      [48.7585, 9.1745, 305],
      [48.757, 9.171, 325],
      [48.7555, 9.1745, 350],
      [48.7535, 9.1705, 378],
      [48.7515, 9.1735, 405],
      [48.7495, 9.169, 430],
      [48.7475, 9.1715, 452],
      [48.745, 9.17, 468],
    ],
  },
  {
    id: 'ludwigsburg',
    kind: 'motorway',
    vmax: 28,
    from: 'Bad Cannstatt',
    to: 'Ludwigsburg',
    city: 'Stuttgart',
    cc: 'DE',
    points: [
      [48.79, 9.205, 225],
      [48.805, 9.198, 240],
      [48.83, 9.19, 262],
      [48.855, 9.188, 280],
      [48.875, 9.19, 290],
      [48.8965, 9.192, 292],
    ],
  },
  {
    id: 'a8-west',
    kind: 'motorway',
    vmax: 37,
    from: 'Munich',
    to: 'Stuttgart',
    city: 'Munich',
    cc: 'DE',
    points: [
      [48.165, 11.46, 520],
      [48.215, 11.36, 505],
      [48.29, 11.26, 495],
      [48.34, 11.08, 480],
      [48.385, 10.93, 485],
      [48.425, 10.8, 470],
      [48.43, 10.6, 480],
      [48.43, 10.42, 465],
      [48.455, 10.2, 470],
      [48.46, 10.09, 490],
      [48.45, 9.93, 560],
      [48.51, 9.76, 700],
      [48.56, 9.65, 720],
      [48.595, 9.61, 640],
      [48.635, 9.56, 400],
      [48.67, 9.37, 280],
      [48.7, 9.27, 340],
      [48.725, 9.2, 420],
    ],
  },
  {
    id: 'a8-east',
    kind: 'motorway',
    vmax: 36,
    from: 'Ramersdorf',
    to: 'Bad Reichenhall',
    city: 'Munich',
    cc: 'DE',
    points: [
      [48.115, 11.62, 530],
      [48.06, 11.71, 590],
      [47.99, 11.8, 650],
      [47.9, 11.86, 700],
      [47.83, 11.9, 730],
      [47.84, 12.0, 520],
      [47.83, 12.1, 460],
      [47.81, 12.25, 520],
      [47.81, 12.37, 530],
      [47.85, 12.6, 600],
      [47.8, 12.75, 520],
      [47.78, 12.88, 470],
    ],
  },
  {
    id: 'kesselberg',
    kind: 'pass',
    vmax: 18,
    from: 'Kochel am See',
    to: 'Walchensee',
    city: 'Kochel am See',
    cc: 'DE',
    points: [
      [47.659, 11.368, 600],
      [47.6545, 11.3735, 615],
      [47.65, 11.372, 640],
      [47.647, 11.365, 668],
      [47.644, 11.37, 700],
      [47.641, 11.364, 735],
      [47.638, 11.369, 770],
      [47.635, 11.363, 805],
      [47.632, 11.366, 838],
      [47.63, 11.363, 858],
      [47.625, 11.356, 835],
      [47.62, 11.348, 812],
      [47.617, 11.342, 802],
    ],
  },
  {
    id: 'grossglockner',
    kind: 'pass',
    vmax: 19,
    from: 'Fusch',
    to: 'Heiligenblut',
    city: 'Fusch an der Großglocknerstraße',
    cc: 'AT',
    points: [
      [47.226, 12.833, 810],
      [47.195, 12.824, 1000],
      [47.168, 12.812, 1150],
      [47.16, 12.795, 1350],
      [47.152, 12.81, 1550],
      [47.143, 12.796, 1720],
      [47.135, 12.8, 1850],
      [47.128, 12.79, 2100],
      [47.122, 12.808, 2428],
      [47.105, 12.82, 2380],
      [47.095, 12.835, 2450],
      [47.083, 12.843, 2504],
      [47.075, 12.855, 2300],
      [47.065, 12.84, 2050],
      [47.055, 12.85, 1750],
      [47.04, 12.842, 1300],
    ],
  },
];

const SCHEDULE: [number, number, number, string, boolean][] = [
  [61, 8, 5, 'schwabing', false],
  [60, 17, 40, 'mittlerer-ring', false],
  [58, 9, 15, 'englischer-garten', false],
  [56, 7, 50, 'airport', false],
  [55, 19, 10, 'airport', true],
  [52, 10, 30, 'starnberg', false],
  [52, 16, 45, 'starnberg', true],
  [49, 8, 20, 'schwabing', true],
  [47, 6, 40, 'a8-west', false],
  [46, 8, 15, 'feuerbach', false],
  [46, 13, 5, 'weinsteige', false],
  [45, 18, 30, 'ludwigsburg', false],
  [44, 9, 0, 'weinsteige', true],
  [44, 15, 20, 'a8-west', true],
  [40, 12, 10, 'englischer-garten', true],
  [36, 7, 55, 'a8-east', false],
  [35, 10, 30, 'grossglockner', false],
  [33, 14, 0, 'grossglockner', true],
  [32, 9, 40, 'a8-east', true],
  [28, 17, 25, 'mittlerer-ring', true],
  [24, 2, 15, 'airport', true],
  [21, 11, 0, 'kesselberg', false],
  [21, 15, 30, 'kesselberg', true],
  [17, 8, 10, 'schwabing', false],
  [12, 18, 5, 'mittlerer-ring', false],
  [9, 5, 20, 'starnberg', false],
  [6, 8, 30, 'englischer-garten', false],
  [3, 17, 50, 'schwabing', true],
  [1, 7, 45, 'airport', false],
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());

const uuid = (r: () => number) => {
  const hex = Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};

type Grid = { p: LatLng[]; alt: number[]; s: number[] };

const STEP = 5;

function densify(points: [number, number, number][], smooth: boolean): Grid {
  const p: LatLng[] = [];
  const alt: number[] = [];
  const pt = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const [b, c] = [pt(i), pt(i + 1)];
    const [a, d] = smooth ? [pt(i - 1), pt(i + 2)] : [b, c];
    const len = haversine({ lat: b[0], lng: b[1] }, { lat: c[0], lng: c[1] });
    const n = Math.max(1, Math.ceil(len / (STEP / 2)));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (x0: number, x1: number, x2: number, x3: number) =>
        0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
      p.push({ lat: cr(a[0], b[0], c[0], d[0]), lng: cr(a[1], b[1], c[1], d[1]) });
      alt.push(b[2] + (c[2] - b[2]) * (t * t * (3 - 2 * t)));
    }
  }
  const last = points[points.length - 1];
  p.push({ lat: last[0], lng: last[1] });
  alt.push(last[2]);

  const out: Grid = { p: [p[0]], alt: [alt[0]], s: [0] };
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    acc += haversine(p[i - 1], p[i]);
    if (acc - out.s[out.s.length - 1] >= STEP || i === p.length - 1) {
      out.p.push(p[i]);
      out.alt.push(alt[i]);
      out.s.push(acc);
    }
  }
  return out;
}

function generate(route: Route, reverse: boolean, start: number, r: () => number): Fix[] {
  const points = reverse ? [...route.points].reverse() : [...route.points];
  if (route.kind === 'city') {
    const leg = (from: [number, number, number], to: [number, number, number], side: number, len: number): [number, number, number] => {
      const h = bearing({ lat: from[0], lng: from[1] }, { lat: to[0], lng: to[1] });
      const p = destination({ lat: from[0], lng: from[1] }, h + side, len);
      return [p.lat, p.lng, from[2]];
    };
    points.unshift(leg(points[0], points[1], -90, 180 + r() * 120));
    points.push(leg(points[points.length - 1], points[points.length - 2], -90, 120 + r() * 120));
  }
  const g = densify(points, route.kind !== 'city');
  const n = g.p.length;
  const heading = g.p.map((_, k) => bearing(g.p[Math.max(0, k - 1)], g.p[Math.min(n - 1, k + 1)]));

  const v: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 3);
    const b = Math.min(n - 1, k + 3);
    const turn = Math.abs(angleDiff(heading[b], heading[a])) * (Math.PI / 180);
    const curvature = turn / Math.max(1, g.s[b] - g.s[a]);
    v[k] = Math.min(route.vmax, Math.sqrt(2.6 / Math.max(curvature, 1e-6)));
  }
  if (route.kind === 'motorway') {
    const zones = Math.floor(g.s[n - 1] / 30_000);
    for (let z = 0; z < zones; z++) {
      const at = Math.floor(r() * n);
      for (let k = at; k < Math.min(n, at + 400); k++) v[k] = Math.min(v[k], 22);
    }
    for (let k = 0; k < n; k++) v[k] = Math.min(v[k], route.vmax - 4 + 4 * Math.sin(g.s[k] / 4000));
  }

  const dwell = new Map<number, number>();
  if (route.kind === 'city') {
    let next = 250 + r() * 500;
    for (let k = 0; k < n; k++) {
      if (g.s[k] >= next && g.s[n - 1] - g.s[k] > 150) {
        v[k] = 0;
        dwell.set(k, 8 + r() * 45);
        next = g.s[k] + 300 + r() * 600;
      }
    }
  }
  v[0] = 0;
  v[n - 1] = 0;
  const accel = 1.4;
  const decel = route.kind === 'city' ? 2.3 : 1.8;
  for (let k = 1; k < n; k++) v[k] = Math.min(v[k], Math.sqrt(v[k - 1] ** 2 + 2 * accel * (g.s[k] - g.s[k - 1])));
  for (let k = n - 2; k >= 0; k--) v[k] = Math.min(v[k], Math.sqrt(v[k + 1] ** 2 + 2 * decel * (g.s[k + 1] - g.s[k])));

  const time: number[] = [0];
  const hold: number[] = [0];
  for (let k = 1; k < n; k++) {
    const ds = g.s[k] - g.s[k - 1];
    const vv = (v[k - 1] + v[k]) / 2;
    const prev = time[k - 1] + hold[k - 1];
    time.push(prev + ds / Math.max(vv, 0.3));
    hold.push(dwell.get(k) ?? 0);
  }

  const lanes: number[] = [];
  if (route.kind === 'motorway') {
    for (let s = 3000 + r() * 4000; s < g.s[n - 1] - 2000; s += 4000 + r() * 9000) lanes.push(s);
  }
  const lateral = (s: number) => {
    let y = 0;
    lanes.forEach((at, i) => {
      const f = Math.max(0, Math.min(1, (s - at) / 100));
      y += (i % 2 === 0 ? -3.5 : 3.5) * f * f * (3 - 2 * f);
    });
    return y;
  };

  const interval = 1;
  const end = time[n - 1];
  const fixes: Fix[] = [];
  let k = 0;
  let prev: LatLng | null = null;
  for (let t = 0; t <= end; t += interval) {
    while (k < n - 2 && time[k + 1] <= t) k++;
    let s: number;
    let speed: number;
    let f = 0;
    if (t <= time[k] + hold[k]) {
      s = g.s[k];
      speed = v[k];
    } else {
      const span = time[k + 1] - (time[k] + hold[k]);
      f = span > 0 ? Math.min(1, (t - time[k] - hold[k]) / span) : 1;
      s = g.s[k] + (g.s[k + 1] - g.s[k]) * f;
      speed = v[k] + (v[k + 1] - v[k]) * f;
    }
    const base = { lat: g.p[k].lat + (g.p[k + 1].lat - g.p[k].lat) * f, lng: g.p[k].lng + (g.p[k + 1].lng - g.p[k].lng) * f };
    const h = heading[k];
    const shifted = destination(base, h + 90, lateral(s));
    const noisy = destination(destination(shifted, 0, gauss(r) * 1.2), 90, gauss(r) * 1.2);
    const course = speed > 1 && prev ? bearing(prev, shifted) : null;
    prev = shifted;
    fixes.push({
      t: Math.round(start + t * 1000),
      lat: Math.round(noisy.lat * 1e6) / 1e6,
      lng: Math.round(noisy.lng * 1e6) / 1e6,
      alt: Math.round((g.alt[k] + (g.alt[k + 1] - g.alt[k]) * f + gauss(r) * 0.8) * 10) / 10,
      speed: Math.max(0, Math.round((speed + gauss(r) * 0.15) * 100) / 100),
      heading: course == null ? null : Math.round(course * 10) / 10,
      acc: Math.round(4 + r() * 6),
    });
  }
  return fixes;
}

export function generateDemoDrives(now: Date, sample: boolean): Drive[] {
  const r = rng(sample ? 2026 : 57);
  let held = 0;
  return SCHEDULE.map(([daysAgo, hour, minute, routeId, reverse]) => {
    const route = ROUTES.find((x) => x.id === routeId) as Route;
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute, Math.floor(r() * 60));
    const fixes = generate(route, reverse, day.getTime(), r);
    const { metrics, events } = computeMetrics(fixes);
    const cells = cellsFor(fixes);
    const claimed = Math.round(cells.length * (0.35 + r() * 0.3));
    const stolen = Math.round(cells.length * r() * 0.12);
    held += claimed + stolen;
    const from = reverse ? route.to : route.from;
    const to = reverse ? route.from : route.to;
    return {
      id: uuid(r),
      ...metrics,
      startedAt: new Date(fixes[0].t).toISOString(),
      endedAt: new Date(fixes[fixes.length - 1].t).toISOString(),
      startPlace: from,
      endPlace: to,
      city: route.city,
      countryCode: route.cc,
      cells,
      preview: simplify(fixes, 15),
      uploaded: !sample,
      territory: sample ? null : { claimed, stolen, refreshed: Math.max(0, cells.length - claimed - stolen), held },
      sample: sample || undefined,
      fixes,
      events,
    };
  });
}
