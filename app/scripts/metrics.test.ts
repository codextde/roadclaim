import { describe, expect, test } from 'bun:test';
import { gridDistance, latLngToCell } from 'h3-js';

import { destination, haversine } from '../src/core/geo';
import { cellRuleViolation, cellsFor, computeMetrics, filterFixes, fitCells, simplify, trimStationary } from '../src/core/metrics';
import type { Fix } from '../src/core/types';
import { buildPath, gauss, MUNICH, rng, simulate } from './synth';

describe('straight line', () => {
  const path = buildPath(MUNICH, 90, [{ straight: 10_000 }]);
  const fixes = simulate({ path, speed: () => 25, alt: () => 520 });
  const { metrics, events } = computeMetrics(fixes);

  test('distance and time', () => {
    expect(Math.abs(metrics.distanceM - 10_000)).toBeLessThan(30);
    expect(metrics.durationS).toBe(400);
    expect(metrics.movingS).toBe(400);
    expect(metrics.stoppedS).toBe(0);
    expect(metrics.stops).toBe(0);
  });

  test('speeds', () => {
    expect(metrics.maxSpeedMps).toBeCloseTo(25, 1);
    expect(metrics.avgSpeedMps).toBeCloseTo(25, 0);
  });

  test('no events on a flat straight road', () => {
    expect(metrics.turnsLeft + metrics.turnsRight).toBe(0);
    expect(metrics.brakePresses).toBe(0);
    expect(metrics.laneChanges).toBe(0);
    expect(metrics.elevationGainM).toBe(0);
    expect(metrics.elevationLossM).toBe(0);
    expect(metrics.highestM).toBe(520);
    expect(metrics.steepestClimbPct).toBe(0);
    expect(metrics.maxG).toBeLessThan(0.05);
    expect(events).toHaveLength(0);
  });
});

describe('city loop with known turns', () => {
  const corner = (turn: number) => ({ turn, radius: 12 });
  const path = buildPath(MUNICH, 0, [
    { straight: 250 },
    corner(90),
    { straight: 300 },
    corner(90),
    { straight: 180 },
    corner(-90),
    { straight: 120 },
    corner(90),
    { straight: 200 },
    corner(-75),
    { straight: 160 },
    corner(90),
    { straight: 260 },
    { turn: 20, radius: 300 },
    { straight: 150 },
  ]);
  const near = (s: number) => {
    let d = Infinity;
    for (const [a, b] of path.arcs) d = Math.min(d, s < a ? a - s : s > b ? s - b : 0);
    return d;
  };
  const fixes = simulate({ path, speed: (_t, s) => Math.min(13, Math.sqrt(25 + 2 * 0.9 * near(s))) });
  const { metrics, events } = computeMetrics(fixes);

  test('counts left and right turns', () => {
    expect(metrics.turnsRight).toBe(4);
    expect(metrics.turnsLeft).toBe(2);
    expect(events.filter((e) => e.kind === 'turn_left')).toHaveLength(2);
  });

  test('gentle braking into corners is not a brake press', () => {
    expect(metrics.brakePresses).toBe(0);
  });

  test('distance follows the path', () => {
    expect(Math.abs(metrics.distanceM - path.length) / path.length).toBeLessThan(0.02);
  });

  test('lateral g in corners', () => {
    expect(metrics.maxG).toBeGreaterThan(0.15);
    expect(metrics.maxG).toBeLessThan(0.4);
  });
});

describe('braking profile', () => {
  const path = buildPath(MUNICH, 45, [{ straight: 6000 }]);
  const speed = (t: number) => {
    if (t < 30) return 20;
    if (t < 35) return 20 - 3 * (t - 30);
    if (t < 55) return 5;
    if (t < 65) return 5 + 1.5 * (t - 55);
    if (t < 90) return 20;
    if (t < 98) return Math.max(0, 20 - 2.5 * (t - 90));
    if (t < 130) return 0;
    if (t < 140) return 1.5 * (t - 130);
    if (t < 160) return 15;
    if (t < 170) return 15 - 0.8 * (t - 160);
    return 7;
  };
  const fixes = simulate({ path, speed, duration: 200 });
  const { metrics, events } = computeMetrics(fixes);

  test('counts hard decelerations only', () => {
    expect(metrics.brakePresses).toBe(2);
    const brakes = events.filter((e) => e.kind === 'brake');
    expect(brakes[0].t - fixes[0].t).toBeGreaterThanOrEqual(29_000);
    expect(brakes[0].t - fixes[0].t).toBeLessThanOrEqual(32_000);
    expect(brakes[0].value).toBeGreaterThan(2.5);
    expect(brakes[1].t - fixes[0].t).toBeGreaterThanOrEqual(89_000);
  });

  test('one stop of about 32 s', () => {
    expect(metrics.stops).toBe(1);
    expect(metrics.stoppedS).toBeGreaterThanOrEqual(30);
    expect(metrics.stoppedS).toBeLessThanOrEqual(36);
    expect(metrics.movingS + metrics.stoppedS).toBe(metrics.durationS);
  });

  test('hardest acceleration and max g', () => {
    expect(metrics.maxAccelMps2).toBeGreaterThan(1.2);
    expect(metrics.maxAccelMps2).toBeLessThan(1.8);
    expect(metrics.maxG).toBeGreaterThan(0.25);
    expect(metrics.maxG).toBeLessThan(0.35);
  });
});

describe('hill climb', () => {
  const r = rng(7);
  const path = buildPath(MUNICH, 180, [{ straight: 7000 }]);
  const alt = (s: number) => {
    const base = s < 1000 ? 600 : s < 4000 ? 600 + (s - 1000) * 0.1 : s < 5500 ? 900 - (s - 4000) * 0.1 : 750;
    return base + gauss(r) * 0.8;
  };
  const fixes = simulate({ path, speed: () => 15, alt });
  const { metrics } = computeMetrics(fixes);

  test('gain and loss with hysteresis', () => {
    expect(metrics.elevationGainM).toBeGreaterThan(293);
    expect(metrics.elevationGainM).toBeLessThan(306);
    expect(metrics.elevationLossM).toBeGreaterThan(143);
    expect(metrics.elevationLossM).toBeLessThan(156);
  });

  test('highest point and steepest grades', () => {
    expect(metrics.highestM as number).toBeGreaterThan(890);
    expect(metrics.highestM as number).toBeLessThan(903);
    expect(metrics.steepestClimbPct as number).toBeGreaterThan(9.3);
    expect(metrics.steepestClimbPct as number).toBeLessThan(10.5);
    expect(metrics.steepestDescentPct as number).toBeGreaterThan(9.3);
    expect(metrics.steepestDescentPct as number).toBeLessThan(10.5);
  });

  test('no altitude means null elevation stats', () => {
    const flat = computeMetrics(fixes.map((f) => ({ ...f, alt: null })));
    expect(flat.metrics.highestM).toBeNull();
    expect(flat.metrics.steepestClimbPct).toBeNull();
    expect(flat.metrics.elevationGainM).toBe(0);
  });
});

describe('lane changes', () => {
  const v = 27;
  const changes = [60, 120, 200];
  const lateral = (t: number) => {
    let y = 0;
    for (const [i, at] of changes.entries()) {
      const f = Math.max(0, Math.min(1, (t - at) / 4));
      y += (i % 2 === 0 ? 3.5 : -3.5) * (3 * f * f - 2 * f * f * f);
    }
    return y;
  };
  const dLateral = (t: number) => (lateral(t + 0.01) - lateral(t - 0.01)) / 0.02;
  const r = rng(3);
  const fixes: Fix[] = [];
  for (let t = 0; t <= 260; t++) {
    const along = destination(MUNICH, 90, v * t);
    const p = destination(along, 180, lateral(t));
    const heading = 90 + (Math.atan2(dLateral(t), v) * 180) / Math.PI;
    fixes.push({ t: 1_760_000_000_000 + t * 1000, lat: p.lat, lng: p.lng, alt: 500, speed: v + gauss(r) * 0.1, heading: heading + gauss(r) * 0.2, acc: 4 });
  }
  const { metrics, events } = computeMetrics(fixes);

  test('detects each S-pattern once', () => {
    expect(metrics.laneChanges).toBe(3);
    const at = events.filter((e) => e.kind === 'lane_change').map((e) => (e.t - fixes[0].t) / 1000);
    changes.forEach((c, i) => expect(Math.abs(at[i] - (c + 2))).toBeLessThanOrEqual(2));
  });

  test('lane changes are not turns', () => {
    expect(metrics.turnsLeft + metrics.turnsRight).toBe(0);
  });

  test('no lane changes below 50 km/h', () => {
    const slow = fixes.map((f, i) => ({ ...f, t: fixes[0].t + i * 3000, speed: 9 }));
    expect(computeMetrics(slow).metrics.laneChanges).toBe(0);
  });

  test('a gentle motorway curve is not a lane change', () => {
    const path = buildPath(MUNICH, 0, [{ straight: 1500 }, { turn: 25, radius: 900 }, { straight: 1500 }]);
    const curve = simulate({ path, speed: () => 30 });
    expect(computeMetrics(curve).metrics.laneChanges).toBe(0);
  });
});

describe('gps noise and teleports', () => {
  const r = rng(11);
  const path = buildPath(MUNICH, 30, [{ straight: 8000 }]);
  const clean = simulate({ path, speed: () => 20 });
  const noisy: Fix[] = clean.map((f) => {
    const p = destination(destination(f, 0, gauss(r) * 2.5), 90, gauss(r) * 2.5);
    return { ...f, lat: p.lat, lng: p.lng, acc: 8 };
  });
  noisy[50] = { ...noisy[50], lat: noisy[50].lat + 0.05 };
  noisy[51] = { ...noisy[51], lng: noisy[51].lng - 0.08 };
  noisy[200] = { ...noisy[200], acc: 120, lat: noisy[200].lat + 0.002 };
  noisy[300] = { ...noisy[300], lat: 0, lng: 0 };
  noisy.push({ ...noisy[10] });

  test('filters inaccurate fixes and teleports', () => {
    const kept = filterFixes(noisy);
    expect(kept.length).toBe(clean.length - 4);
    for (let i = 1; i < kept.length; i++) expect(kept[i].t).toBeGreaterThan(kept[i - 1].t);
  });

  test('distance stays close to the truth', () => {
    const { metrics } = computeMetrics(noisy);
    expect(Math.abs(metrics.distanceM - 8000) / 8000).toBeLessThan(0.02);
    expect(metrics.maxSpeedMps).toBeLessThan(21);
    expect(metrics.turnsLeft + metrics.turnsRight).toBe(0);
    expect(metrics.laneChanges).toBe(0);
  });

  test('implausible reported speeds fall back to positional speed', () => {
    const spiky = clean.map((f, i) => ({ ...f, speed: i % 50 === 7 ? 150 : i % 40 === 3 ? 60 : i % 3 === 0 ? 0 : f.speed }));
    const { metrics } = computeMetrics(spiky);
    expect(metrics.maxSpeedMps).toBeLessThan(21);
    expect(metrics.stops).toBe(0);
    expect(metrics.movingS).toBe(metrics.durationS);
    expect(metrics.brakePresses).toBe(0);
  });

  test('a bad first fix does not poison the drive', () => {
    const bad = [{ ...clean[0], t: clean[0].t - 1000, lat: clean[0].lat + 1 }, ...clean];
    expect(filterFixes(bad).length).toBe(clean.length);
  });

  test('jitter while parked adds no distance', () => {
    const parked: Fix[] = Array.from({ length: 300 }, (_, i) => {
      const p = destination(destination(MUNICH, 0, gauss(r) * 3), 90, gauss(r) * 3);
      return { t: 1_760_000_000_000 + i * 1000, lat: p.lat, lng: p.lng, alt: null, speed: Math.abs(gauss(r) * 0.2), heading: null, acc: 10 };
    });
    const { metrics } = computeMetrics(parked);
    expect(metrics.distanceM).toBe(0);
    expect(metrics.stops).toBe(1);
    expect(metrics.movingS).toBe(0);
  });
});

describe('stop and go', () => {
  const path = buildPath(MUNICH, 270, [{ straight: 5000 }]);
  const cycle = (t: number) => {
    const c = t % 35;
    if (c < 4) return 2 * c;
    if (c < 20) return 8;
    if (c < 24) return 8 - 2 * (c - 20);
    return 0;
  };
  const fixes = simulate({ path, speed: (t) => (t > 350 && t < 400 ? (t % 10 < 6 ? 6 : 0.5) : cycle(t)), duration: 405 });
  const { metrics } = computeMetrics(fixes);

  test('counts stops of at least 10 s', () => {
    expect(metrics.stops).toBe(10);
    expect(metrics.stoppedS).toBeGreaterThanOrEqual(10 * 10);
    expect(metrics.stoppedS).toBeLessThanOrEqual(10 * 13);
  });

  test('average speed uses moving time', () => {
    expect(metrics.avgSpeedMps).toBeCloseTo(metrics.distanceM / metrics.movingS, 1);
    expect(metrics.avgSpeedMps).toBeGreaterThan(4);
  });

  test('trims the parked tail', () => {
    const parked = [...fixes, ...Array.from({ length: 120 }, (_, i) => ({ ...fixes[fixes.length - 1], t: fixes[fixes.length - 1].t + (i + 1) * 1000, speed: 0 }))];
    const trimmed = trimStationary(parked);
    expect(trimmed.length).toBeLessThan(fixes.length + 2);
    expect(trimmed.length).toBeGreaterThan(fixes.length - 30);
  });
});

describe('h3 cells', () => {
  const steps = (a: string, b: string) => gridDistance(a, b);
  const assertServerRules = (fixes: Fix[]) => {
    const { metrics } = computeMetrics(fixes);
    const cells = cellsFor(fixes);
    expect(cells.length).toBeGreaterThan(0);
    let hops = 0;
    for (let i = 1; i < cells.length; i++) {
      const s = steps(cells[i - 1], cells[i]);
      expect(s).toBeLessThanOrEqual(20);
      hops += s;
    }
    expect(hops * 175).toBeLessThanOrEqual(metrics.distanceM * 1.5 + 1000);
    expect(cells.length).toBeLessThanOrEqual(metrics.distanceM / 100 + 20);
    expect(cellRuleViolation(cells, metrics.distanceM)).toBeNull();
    expect(cellRuleViolation(fitCells(cells, metrics.distanceM), metrics.distanceM)).toBeNull();
    return cells;
  };

  test('fast sparse drive leaves no gaps', () => {
    const path = buildPath(MUNICH, 60, [{ straight: 40_000 }]);
    const fixes = simulate({ path, speed: () => 60, interval: 12 });
    const cells = assertServerRules(fixes);
    expect(new Set(cells).size).toBe(cells.length);
    for (let i = 1; i < cells.length; i++) expect(steps(cells[i - 1], cells[i])).toBe(1);
    expect(cells[0]).toBe(latLngToCell(fixes[0].lat, fixes[0].lng, 9));
  });

  test('out and back with a new cell at the end', () => {
    const path = buildPath(MUNICH, 0, [{ straight: 12_000 }, { turn: 180, radius: 15 }, { straight: 12_000 }, { turn: 90, radius: 15 }, { straight: 1500 }]);
    const cells = assertServerRules(simulate({ path, speed: () => 20 }));
    expect(cells.length).toBeGreaterThan(new Set(cells).size);
  });

  test('loop', () => {
    const path = buildPath(MUNICH, 90, [{ straight: 5000 }, { turn: 90, radius: 30 }, { straight: 5000 }, { turn: 90, radius: 30 }, { straight: 5000 }, { turn: 90, radius: 30 }, { straight: 5200 }, { turn: 90, radius: 30 }, { straight: 2000 }]);
    assertServerRules(simulate({ path, speed: () => 18 }));
  });

  test('8 km tunnel without fixes is filled', () => {
    const path = buildPath(MUNICH, 120, [{ straight: 20_000 }]);
    const all = simulate({ path, speed: () => 25 });
    const fixes = all.filter((f) => {
      const s = (f.t - all[0].t) / 1000;
      return s < 200 || s > 520;
    });
    const cells = assertServerRules(fixes);
    for (let i = 1; i < cells.length; i++) expect(steps(cells[i - 1], cells[i])).toBe(1);
  });

  test('resumed drive after a long unrecorded leg', () => {
    const first = simulate({ path: buildPath(MUNICH, 0, [{ straight: 6000 }]), speed: () => 15 });
    const away = destination(first[first.length - 1], 45, 35_000);
    const second = simulate({ path: buildPath(away, 270, [{ straight: 6000 }]), speed: () => 15, t0: first[first.length - 1].t + 40 * 60_000 });
    const back = simulate({ path: buildPath(destination(away, 270, 6000), 225, [{ straight: 30_000 }]), speed: () => 30, t0: second[second.length - 1].t + 1000 });
    assertServerRules([...first, ...second, ...back]);
  });

  test('fitCells repairs lists that break the rules', () => {
    const a = latLngToCell(48.1, 11.5, 9);
    const far = latLngToCell(48.1, 11.9, 9);
    const fixed = fitCells([a, far], 40_000);
    expect(fixed[0]).toBe(a);
    expect(fixed[fixed.length - 1]).toBe(far);
    expect(cellRuleViolation(fixed, 40_000)).toBeNull();
    const short = fitCells([a, far], 1000);
    expect(cellRuleViolation(short, 1000)).toBeNull();
    expect(short.length).toBeLessThan(fixed.length);
  });
});

describe('simplify', () => {
  test('straight line collapses to its ends', () => {
    const fixes = simulate({ path: buildPath(MUNICH, 10, [{ straight: 3000 }]), speed: () => 20 });
    expect(simplify(fixes, 5)).toHaveLength(2);
  });

  test('keeps corners', () => {
    const fixes = simulate({ path: buildPath(MUNICH, 0, [{ straight: 1000 }, { turn: 90, radius: 5 }, { straight: 1000 }]), speed: () => 10 });
    const out = simplify(fixes, 10);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(5);
    const corner = destination(MUNICH, 0, 1005);
    expect(out.some(([lat, lng]) => haversine({ lat, lng }, corner) < 20)).toBe(true);
  });
});

describe('degenerate input', () => {
  test('empty and single fix', () => {
    expect(computeMetrics([]).metrics.distanceM).toBe(0);
    const one = computeMetrics([{ t: 1, lat: 48, lng: 11, alt: 400, speed: 0, heading: null, acc: 5 }]);
    expect(one.metrics.highestM).toBe(400);
    expect(cellsFor([])).toEqual([]);
    expect(simplify([], 5)).toEqual([]);
  });
});
