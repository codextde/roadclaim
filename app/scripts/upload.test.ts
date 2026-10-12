import { describe, expect, test } from 'bun:test';
import { latLngToCell } from 'h3-js';

import { shrinkForBackup, toUpload } from '../src/api/upload';
import { cellRuleViolation } from '../src/core/metrics';
import { generateDemoDrives } from '../src/data/demo';

const [base] = generateDemoDrives(new Date(2026, 9, 12), true);

describe('toUpload', () => {
  test('passes the server rules for demo drives', () => {
    const u = toUpload(base);
    expect(u.movingS).toBeLessThanOrEqual(u.durationS);
    expect(u.maxSpeedMps).toBeLessThanOrEqual(90);
    expect(u.distanceM).toBeLessThanOrEqual(u.maxSpeedMps * u.movingS * 1.1 + 500);
    expect(cellRuleViolation(u.cells, u.distanceM)).toBeNull();
    expect(u.cells).toEqual(base.cells);
  });

  test('clamps implausible values', () => {
    const u = toUpload({
      ...base,
      maxSpeedMps: 140,
      movingS: base.durationS + 300,
      distanceM: 500_000,
      cells: [latLngToCell(48.1, 11.5, 9), latLngToCell(48.1, 11.9, 9)],
    });
    expect(u.maxSpeedMps).toBe(90);
    expect(u.movingS).toBe(u.durationS);
    expect(u.distanceM).toBeLessThanOrEqual(u.maxSpeedMps * u.movingS * 1.1 + 500);
    expect(u.avgSpeedMps).toBeLessThanOrEqual(70);
    expect(cellRuleViolation(u.cells, u.distanceM)).toBeNull();
  });

  test('raises max speed when distance needs it', () => {
    const u = toUpload({ ...base, maxSpeedMps: 1, movingS: 600, durationS: 700, distanceM: 10_000 });
    expect(u.distanceM).toBe(10_000);
    expect(u.distanceM).toBeLessThanOrEqual(u.maxSpeedMps * u.movingS * 1.1 + 500);
  });
});

describe('backup size', () => {
  test('downsamples tracks above 5 MB and keeps both ends', () => {
    const fixes = Array.from({ length: 60_000 }, (_, i) => ({ ...base.fixes[i % base.fixes.length], t: base.fixes[0].t + i * 1000 }));
    const big = { ...base, fixes };
    const small = shrinkForBackup(big);
    expect(JSON.stringify(small).length).toBeLessThan(5_000_000);
    expect(small.fixes[0]).toEqual(fixes[0]);
    expect(small.fixes[small.fixes.length - 1]).toEqual(fixes[fixes.length - 1]);
    expect(shrinkForBackup(base)).toBe(base);
  });
});
