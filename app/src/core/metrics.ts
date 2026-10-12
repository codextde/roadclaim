import { gridDistance, gridPathCells, latLngToCell } from 'h3-js';

import { angleDiff, bearing, haversine, interpolate } from './geo';
import type { DriveEvent, DriveMetrics, Fix } from './types';

export const MAX_ACCURACY_M = 50;
export const MAX_IMPLIED_SPEED_MPS = 70;
export const H3_RESOLUTION = 9;

const STOP_SPEED = 1.5;
const STOP_MIN_MS = 10_000;
const JITTER_SPEED = 1;
const G = 9.80665;

const TURN_STEP_M = 10;
const TURN_WINDOW_STEPS = 6;
const TURN_MIN_DEG = 60;
const TURN_MIN_SPEED = 3;

const BRAKE_MPS2 = -1.2;
const BRAKE_DEBOUNCE_MS = 3000;

const LANE_MIN_SPEED = 50 / 3.6;
const LANE_MIN_DEG = 2;
const LANE_MAX_DEG = 12;
const LANE_MIN_MS = 3000;
const LANE_MAX_MS = 8000;
const LANE_RETURN_DEG = 1;

const ELEVATION_HYSTERESIS_M = 3;
const ELEVATION_SMOOTH_MS = 5000;
const GRADE_WINDOW_M = 500;

const GAP_FILL_MAX_M = 20_000;

const validFix = (f: Fix) =>
  Number.isFinite(f.t) &&
  Number.isFinite(f.lat) &&
  Number.isFinite(f.lng) &&
  Math.abs(f.lat) <= 90 &&
  Math.abs(f.lng) <= 180 &&
  !(f.lat === 0 && f.lng === 0) &&
  (f.acc == null || f.acc <= MAX_ACCURACY_M);

const impliedSpeed = (a: Fix, b: Fix) => haversine(a, b) / Math.max(1, (b.t - a.t) / 1000);

export function filterFixes(fixes: Fix[]): Fix[] {
  const sorted = fixes.filter(validFix).sort((a, b) => a.t - b.t);
  const kept: Fix[] = [];
  let run: Fix[] = [];
  for (const f of sorted) {
    const last = kept[kept.length - 1];
    if (last && f.t <= last.t) continue;
    if (!last || impliedSpeed(last, f) <= MAX_IMPLIED_SPEED_MPS) {
      kept.push(f);
      run = [];
      continue;
    }
    const tail = run[run.length - 1];
    run = tail && f.t > tail.t && impliedSpeed(tail, f) <= MAX_IMPLIED_SPEED_MPS ? [...run, f] : [f];
    if (run.length >= 3 && kept.length <= 2) {
      kept.splice(0, kept.length, ...run);
      run = [];
    }
  }
  return kept;
}

function median3(a: number, b: number, c: number) {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

export function saneSpeed(reported: number | null, positional: number | null): number | null {
  if (reported == null || !Number.isFinite(reported) || reported < 0 || reported > MAX_IMPLIED_SPEED_MPS) return null;
  if (positional == null) return reported;
  if (reported === 0 && positional > 3) return null;
  if (reported > positional * 1.5 + 5) return null;
  return reported;
}

function rawSpeeds(fx: Fix[]): number[] {
  return fx.map((f, i) => {
    const a = fx[Math.max(0, i - 1)];
    const b = fx[Math.min(fx.length - 1, i + 1)];
    const dt = (b.t - a.t) / 1000;
    const positional = dt > 0 ? haversine(a, b) / dt : null;
    return saneSpeed(f.speed, dt > 0 && dt <= 30 ? positional : null) ?? positional ?? 0;
  });
}

function medianFilter(v: number[]): number[] {
  return v.map((x, i) => (i === 0 || i === v.length - 1 ? x : median3(v[i - 1], x, v[i + 1])));
}

function movingAverage(v: number[]): number[] {
  return v.map((x, i) => {
    const a = v[Math.max(0, i - 1)];
    const b = v[Math.min(v.length - 1, i + 1)];
    return (a + x + b) / 3;
  });
}

function derivative(v: number[], fx: Fix[]): number[] {
  return v.map((_, i) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(v.length - 1, i + 1);
    const dt = (fx[b].t - fx[a].t) / 1000;
    return dt > 0 && dt <= 10 ? (v[b] - v[a]) / dt : 0;
  });
}

function headings(fx: Fix[], speeds: number[]): number[] {
  const raw = fx.map((f, i) => {
    if (f.heading != null && Number.isFinite(f.heading) && f.heading >= 0 && speeds[i] >= TURN_MIN_SPEED) return f.heading;
    const a = fx[Math.max(0, i - 1)];
    const b = fx[Math.min(fx.length - 1, i + 1)];
    return haversine(a, b) > 0.5 ? bearing(a, b) : f.heading != null && f.heading >= 0 ? f.heading : NaN;
  });
  const out: number[] = [];
  let prev = NaN;
  for (const h of raw) {
    if (!Number.isFinite(h)) {
      out.push(Number.isFinite(prev) ? prev : 0);
      continue;
    }
    prev = Number.isFinite(prev) ? prev + angleDiff(h, ((prev % 360) + 360) % 360) : h;
    out.push(prev);
  }
  return out;
}

export function speedsOf(fixes: Fix[]): number[] {
  return medianFilter(rawSpeeds(fixes));
}

export function computeMetrics(fixes: Fix[]): { metrics: DriveMetrics; events: DriveEvent[] } {
  const fx = filterFixes(fixes);
  const events: DriveEvent[] = [];
  const empty: DriveMetrics = {
    distanceM: 0,
    durationS: 0,
    movingS: 0,
    stoppedS: 0,
    stops: 0,
    maxSpeedMps: 0,
    avgSpeedMps: 0,
    elevationGainM: 0,
    elevationLossM: 0,
    highestM: null,
    steepestClimbPct: null,
    steepestDescentPct: null,
    turnsLeft: 0,
    turnsRight: 0,
    brakePresses: 0,
    laneChanges: 0,
    maxG: 0,
    maxAccelMps2: 0,
  };
  if (fx.length < 2) return { metrics: { ...empty, highestM: fx[0]?.alt ?? null }, events };

  const event = (kind: DriveEvent['kind'], i: number, value?: number) => {
    const f = fx[i];
    events.push(value == null ? { kind, t: f.t, lat: f.lat, lng: f.lng } : { kind, t: f.t, lat: f.lat, lng: f.lng, value: round(value, 2) });
  };

  const v = speedsOf(fx);
  const vs = movingAverage(v);
  const accel = derivative(vs, fx);

  const cum: number[] = [0];
  let distance = 0;
  for (let i = 1; i < fx.length; i++) {
    const jitter = v[i - 1] < JITTER_SPEED && v[i] < JITTER_SPEED;
    if (!jitter) distance += haversine(fx[i - 1], fx[i]);
    cum.push(distance);
  }

  const durationMs = fx[fx.length - 1].t - fx[0].t;
  let stoppedMs = 0;
  let stops = 0;
  let runStart = -1;
  const closeRun = (end: number) => {
    if (runStart < 0) return;
    const ms = fx[end].t - fx[runStart].t;
    if (ms >= STOP_MIN_MS) {
      stoppedMs += ms;
      stops++;
      event('stop', runStart, ms / 1000);
    }
    runStart = -1;
  };
  for (let i = 1; i < fx.length; i++) {
    const slow = v[i - 1] < STOP_SPEED && v[i] < STOP_SPEED;
    if (slow && runStart < 0) runStart = i - 1;
    if (!slow) closeRun(i - 1);
  }
  closeRun(fx.length - 1);

  const movingS = Math.max(0, (durationMs - stoppedMs) / 1000);
  const maxSpeed = v.reduce((m, x) => Math.max(m, x), 0);

  const elevation = elevationStats(fx, cum);

  let turnsLeft = 0;
  let turnsRight = 0;
  for (const turn of detectTurns(fx, v, cum)) {
    if (turn.delta < 0) turnsLeft++;
    else turnsRight++;
    events.push({ kind: turn.delta < 0 ? 'turn_left' : 'turn_right', t: turn.t, lat: turn.lat, lng: turn.lng, value: round(Math.abs(turn.delta), 1) });
  }

  let brakePresses = 0;
  let braking = false;
  let lastBrakeEnd = -Infinity;
  let brakeStart = 0;
  let brakeMin = 0;
  for (let i = 0; i < fx.length; i++) {
    const a = accel[i];
    if (!braking && a < BRAKE_MPS2 && fx[i].t - lastBrakeEnd >= BRAKE_DEBOUNCE_MS) {
      braking = true;
      brakeStart = i;
      brakeMin = a;
    } else if (braking && a < BRAKE_MPS2) {
      brakeMin = Math.min(brakeMin, a);
    } else if (braking) {
      braking = false;
      lastBrakeEnd = fx[i].t;
      brakePresses++;
      event('brake', brakeStart, -brakeMin);
    } else if (a < BRAKE_MPS2) {
      lastBrakeEnd = fx[i].t;
    }
  }
  if (braking) {
    brakePresses++;
    event('brake', brakeStart, -brakeMin);
  }

  const h = movingAverage(headings(fx, v));
  const yaw = derivative(h, fx);
  let maxG = 0;
  let maxAccel = 0;
  for (let i = 0; i < fx.length; i++) {
    if (vs[i] < TURN_MIN_SPEED) continue;
    const lon = accel[i];
    const lat = vs[i] * ((yaw[i] * Math.PI) / 180);
    const g = Math.hypot(lon, lat) / G;
    if (g <= 2) maxG = Math.max(maxG, g);
    if (lon <= 10) maxAccel = Math.max(maxAccel, lon);
  }

  const lanes = detectLaneChanges(fx, vs, h);
  for (const i of lanes) event('lane_change', i);

  events.sort((a, b) => a.t - b.t);
  return {
    metrics: {
      distanceM: Math.round(distance),
      durationS: Math.round(durationMs / 1000),
      movingS: Math.round(movingS),
      stoppedS: Math.round(stoppedMs / 1000),
      stops,
      maxSpeedMps: round(maxSpeed, 2),
      avgSpeedMps: movingS > 0 ? round(distance / movingS, 2) : 0,
      elevationGainM: round(elevation.gain, 1),
      elevationLossM: round(elevation.loss, 1),
      highestM: elevation.highest == null ? null : round(elevation.highest, 1),
      steepestClimbPct: elevation.climb == null ? null : round(elevation.climb, 1),
      steepestDescentPct: elevation.descent == null ? null : round(elevation.descent, 1),
      turnsLeft,
      turnsRight,
      brakePresses,
      laneChanges: lanes.length,
      maxG: round(maxG, 2),
      maxAccelMps2: round(maxAccel, 2),
    },
    events,
  };
}

function round(x: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function elevationStats(fx: Fix[], cum: number[]) {
  const idx: number[] = [];
  for (let i = 0; i < fx.length; i++) if (fx[i].alt != null && Number.isFinite(fx[i].alt)) idx.push(i);
  if (!idx.length) return { gain: 0, loss: 0, highest: null, climb: null, descent: null };

  const smooth: number[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let k = 0; k < idx.length; k++) {
    const t = fx[idx[k]].t;
    while (hi < idx.length && fx[idx[hi]].t <= t + ELEVATION_SMOOTH_MS) sum += fx[idx[hi++]].alt as number;
    while (fx[idx[lo]].t < t - ELEVATION_SMOOTH_MS) sum -= fx[idx[lo++]].alt as number;
    smooth.push(sum / (hi - lo));
  }

  let gain = 0;
  let loss = 0;
  let ref = smooth[0];
  for (const a of smooth) {
    if (a - ref >= ELEVATION_HYSTERESIS_M) {
      gain += a - ref;
      ref = a;
    } else if (ref - a >= ELEVATION_HYSTERESIS_M) {
      loss += ref - a;
      ref = a;
    }
  }

  let maxGrade = -Infinity;
  let minGrade = Infinity;
  let j = 0;
  for (let k = 0; k < idx.length; k++) {
    if (j < k) j = k;
    while (j < idx.length && cum[idx[j]] - cum[idx[k]] < GRADE_WINDOW_M) j++;
    if (j >= idx.length) break;
    const grade = ((smooth[j] - smooth[k]) / (cum[idx[j]] - cum[idx[k]])) * 100;
    maxGrade = Math.max(maxGrade, grade);
    minGrade = Math.min(minGrade, grade);
  }
  const hasGrade = Number.isFinite(maxGrade);
  return {
    gain,
    loss,
    highest: smooth.reduce((m, x) => Math.max(m, x), -Infinity),
    climb: hasGrade ? Math.max(0, maxGrade) : null,
    descent: hasGrade ? Math.max(0, -minGrade) : null,
  };
}

type Sample = { lat: number; lng: number; t: number; speed: number };

function resample(fx: Fix[], v: number[], cum: number[], step: number): Sample[] {
  const out: Sample[] = [{ lat: fx[0].lat, lng: fx[0].lng, t: fx[0].t, speed: v[0] }];
  let next = step;
  for (let i = 1; i < fx.length; i++) {
    const d0 = cum[i - 1];
    const d1 = cum[i];
    if (d1 <= d0) continue;
    while (next <= d1) {
      const f = (next - d0) / (d1 - d0);
      const p = interpolate(fx[i - 1], fx[i], f);
      out.push({ ...p, t: fx[i - 1].t + (fx[i].t - fx[i - 1].t) * f, speed: v[i - 1] + (v[i] - v[i - 1]) * f });
      next += step;
    }
  }
  return out;
}

function detectTurns(fx: Fix[], v: number[], cum: number[]) {
  const p = resample(fx, v, cum, TURN_STEP_M);
  const turns: { t: number; lat: number; lng: number; delta: number }[] = [];
  const inBearing = (k: number) => bearing(p[k - 2], p[k]);
  const outBearing = (j: number) => bearing(p[j], p[j + 2]);
  let k = 2;
  while (k + 2 < p.length) {
    let found = -1;
    let delta = 0;
    for (let j = k; j <= k + TURN_WINDOW_STEPS && j + 2 < p.length; j++) {
      delta = angleDiff(outBearing(j), inBearing(k));
      if (Math.abs(delta) >= TURN_MIN_DEG) {
        found = j;
        break;
      }
    }
    if (found >= 0) {
      let slow = false;
      for (let m = k - 2; m <= found + 2; m++) if (p[m].speed < TURN_MIN_SPEED) slow = true;
      if (!slow) {
        const mid = p[Math.round((k + found) / 2)];
        turns.push({ t: Math.round(mid.t), lat: mid.lat, lng: mid.lng, delta });
      }
      k = found + 2;
    } else {
      k++;
    }
  }
  return turns;
}

function detectLaneChanges(fx: Fix[], vs: number[], h: number[]): number[] {
  const found: number[] = [];
  let i = 1;
  while (i < fx.length - 1) {
    if (vs[i] < LANE_MIN_SPEED || vs[i - 1] < LANE_MIN_SPEED || Math.abs(h[i] - h[i - 1]) > 0.5) {
      i++;
      continue;
    }
    const base = h[i];
    let peak = 0;
    let peakAt = i;
    let end = -1;
    for (let j = i + 1; j < fx.length && fx[j].t - fx[i].t <= LANE_MAX_MS; j++) {
      if (vs[j] < LANE_MIN_SPEED || fx[j].t - fx[j - 1].t > 3000) break;
      const d = h[j] - base;
      if (Math.abs(d) > LANE_MAX_DEG) break;
      if (Math.abs(d) > Math.abs(peak)) {
        peak = d;
        peakAt = j;
      }
      if (peak !== 0 && Math.abs(peak) >= 1 && d * Math.sign(peak) < -LANE_RETURN_DEG) break;
      if (Math.abs(peak) >= LANE_MIN_DEG && j > peakAt && Math.abs(d) < LANE_RETURN_DEG) {
        if (fx[j].t - fx[i].t >= LANE_MIN_MS) end = j;
        break;
      }
    }
    if (end > 0) {
      found.push(peakAt);
      i = end + 1;
    } else {
      i++;
    }
  }
  return found;
}

export function trimStationary(fixes: Fix[]): Fix[] {
  const fx = filterFixes(fixes);
  if (fx.length < 2) return fx;
  const v = speedsOf(fx);
  let last = fx.length - 1;
  while (last > 0 && v[last] < STOP_SPEED) last--;
  return fx.slice(0, Math.min(fx.length, last + 2));
}

export function simplify(fixes: Fix[], toleranceM: number): [number, number][] {
  const fx = filterFixes(fixes);
  if (fx.length <= 2) return fx.map((f) => [f.lat, f.lng]);
  const lat0 = (fx[0].lat * Math.PI) / 180;
  const kx = 111320 * Math.cos(lat0);
  const ky = 110540;
  const xs = fx.map((f) => f.lng * kx);
  const ys = fx.map((f) => f.lat * ky);
  const keep = new Uint8Array(fx.length);
  keep[0] = 1;
  keep[fx.length - 1] = 1;
  const stack: [number, number][] = [[0, fx.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const len = Math.hypot(dx, dy);
    let maxD = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = len === 0 ? Math.hypot(xs[i] - xs[a], ys[i] - ys[a]) : Math.abs(dy * xs[i] - dx * ys[i] + xs[b] * ys[a] - ys[b] * xs[a]) / len;
      if (d > maxD) {
        maxD = d;
        at = i;
      }
    }
    if (at >= 0 && maxD > toleranceM) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out: [number, number][] = [];
  for (let i = 0; i < fx.length; i++) if (keep[i]) out.push([fx[i].lat, fx[i].lng]);
  return out;
}

const MAX_CELL_STEP = 20;
const ANCHOR_STEP = 18;
const HOP_M = 175;

function gridSteps(a: string, b: string): number {
  if (a === b) return 0;
  try {
    return gridDistance(a, b);
  } catch {
    return Infinity;
  }
}

function lineCells(a: Fix, b: Fix, ca: string, cb: string): string[] {
  try {
    return gridPathCells(ca, cb);
  } catch {
    const n = Math.ceil(haversine(a, b) / 50);
    const out = [ca];
    for (let s = 1; s <= n; s++) {
      const p = interpolate(a, b, s / n);
      const c = latLngToCell(p.lat, p.lng, H3_RESOLUTION);
      if (c !== out[out.length - 1]) out.push(c);
    }
    return out;
  }
}

/**
 * Cells in travel order, each claimed once. Consecutive cells are at most 18 grid steps apart:
 * when a new cell is far from the last emitted one (a revisit, a long bridge), cells along the
 * travelled path are repeated as anchors. Gaps up to 20 km are filled and claimed; longer gaps are
 * bridged by unclaimed anchors only.
 */
export function cellsFor(fixes: Fix[]): string[] {
  const fx = filterFixes(fixes);
  const path: { cell: string; claim: boolean }[] = [];
  const push = (cell: string, claim: boolean) => {
    const last = path[path.length - 1];
    if (last?.cell === cell) {
      last.claim ||= claim;
      return;
    }
    path.push({ cell, claim });
  };
  let prevFix: Fix | null = null;
  for (const f of fx) {
    const cell = latLngToCell(f.lat, f.lng, H3_RESOLUTION);
    const prev = path[path.length - 1]?.cell;
    if (prevFix && prev && cell !== prev && gridSteps(prev, cell) > 1) {
      const claim = haversine(prevFix, f) <= GAP_FILL_MAX_M;
      const line = lineCells(prevFix, f, prev, cell);
      for (let k = 1; k < line.length - 1; k++) push(line[k], claim);
    }
    push(cell, true);
    prevFix = f;
  }

  const out: string[] = [];
  const seen = new Set<string>();
  let lastIdx = -1;
  for (let i = 0; i < path.length; i++) {
    const { cell, claim } = path[i];
    if (!claim || seen.has(cell)) continue;
    if (lastIdx >= 0) {
      let j = lastIdx;
      while (j < i - 1 && gridSteps(path[j].cell, cell) > ANCHOR_STEP) {
        let k = j + 1;
        while (k + 1 < i && gridSteps(path[j].cell, path[k + 1].cell) <= ANCHOR_STEP) k++;
        out.push(path[k].cell);
        j = k;
      }
    }
    out.push(cell);
    seen.add(cell);
    lastIdx = i;
  }
  return out;
}

/** Final safety pass so an upload always satisfies the server's cell rules for the given distance. */
export function fitCells(cells: string[], distanceM: number): string[] {
  const bridged: string[] = [];
  for (const cell of cells) {
    const prev = bridged[bridged.length - 1];
    if (prev && gridSteps(prev, cell) > MAX_CELL_STEP) {
      let line: string[];
      try {
        line = gridPathCells(prev, cell);
      } catch {
        break;
      }
      for (let k = MAX_CELL_STEP; k < line.length - 1; k += MAX_CELL_STEP) bridged.push(line[k]);
    }
    bridged.push(cell);
  }
  const maxHops = (distanceM * 1.5 + 1000) / HOP_M;
  const maxCount = Math.floor(distanceM / 100 + 20);
  const out: string[] = [];
  let hops = 0;
  for (const cell of bridged) {
    const step = out.length ? gridSteps(out[out.length - 1], cell) : 0;
    if (step > MAX_CELL_STEP || hops + step > maxHops || out.length >= maxCount) break;
    hops += step;
    out.push(cell);
  }
  return out;
}

export function cellRuleViolation(cells: string[], distanceM: number): string | null {
  if (cells.length > distanceM / 100 + 20) return 'count';
  let hops = 0;
  for (let i = 1; i < cells.length; i++) {
    const step = gridSteps(cells[i - 1], cells[i]);
    if (!(step <= MAX_CELL_STEP)) return `gap ${i}`;
    hops += step;
  }
  return hops * HOP_M > distanceM * 1.5 + 1000 ? 'hops' : null;
}
