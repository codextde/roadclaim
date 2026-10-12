import { describe, expect, test } from 'bun:test';

import { lifetimeStats, monthlyRecap, monthKey } from '../src/core/stats';
import { generateDemoDrives } from '../src/data/demo';

const now = new Date(2026, 9, 12, 20, 0);
const drives = generateDemoDrives(now, true);
const byRoute = (from: string) => drives.filter((d) => d.startPlace === from);

describe('demo drives', () => {
  test('enough drives over two months', () => {
    expect(drives.length).toBeGreaterThanOrEqual(25);
    const oldest = Math.min(...drives.map((d) => Date.parse(d.startedAt)));
    expect(now.getTime() - oldest).toBeGreaterThan(55 * 86400_000);
    expect(now.getTime() - oldest).toBeLessThan(63 * 86400_000);
    expect(drives.every((d) => d.sample === true && !d.uploaded)).toBe(true);
  });

  test('deterministic', () => {
    const again = generateDemoDrives(now, true);
    expect(again.map((d) => d.id)).toEqual(drives.map((d) => d.id));
    expect(again[5].distanceM).toBe(drives[5].distanceM);
    expect(generateDemoDrives(now, false)[0].id).not.toBe(drives[0].id);
  }, 60_000);

  test('realistic numbers', () => {
    const a8 = byRoute('Munich').find((d) => d.endPlace === 'Stuttgart');
    expect(a8).toBeDefined();
    expect(a8!.distanceM).toBeGreaterThan(170_000);
    expect(a8!.distanceM).toBeLessThan(260_000);
    expect(a8!.avgSpeedMps).toBeGreaterThan(25);
    expect(a8!.laneChanges).toBeGreaterThan(3);
    const glockner = byRoute('Fusch')[0];
    expect(glockner.countryCode).toBe('AT');
    expect(glockner.elevationGainM).toBeGreaterThan(1500);
    expect(glockner.highestM as number).toBeGreaterThan(2400);
    expect(glockner.steepestClimbPct as number).toBeGreaterThan(8);
    const city = byRoute('Bogenhausen')[0];
    expect(city.stops).toBeGreaterThan(5);
    expect(city.brakePresses).toBeGreaterThan(3);
    expect(city.turnsLeft + city.turnsRight).toBeGreaterThan(0);
    for (const d of drives) {
      expect(d.distanceM).toBeGreaterThan(500);
      expect(d.maxSpeedMps).toBeLessThan(42);
      expect(d.cells.length).toBeLessThanOrEqual(d.distanceM / 100 + 20);
      expect(d.preview.length).toBeGreaterThan(1);
    }
  });

  test('lifetime stats and recap', () => {
    const stats = lifetimeStats(drives);
    expect(stats.drives).toBe(drives.length);
    expect(stats.countries).toBe(2);
    expect(stats.activeDays).toBeLessThanOrEqual(drives.length);
    expect(stats.longestM).toBe(Math.max(...drives.map((d) => d.distanceM)));
    const month = monthKey(drives[0].startedAt);
    const recap = monthlyRecap(drives, month);
    expect(recap.drives.length).toBeGreaterThan(0);
    expect(recap.topDay?.startsWith(month)).toBe(true);
    expect(recap.cellsClaimed).toBeGreaterThan(0);
    const ranged = lifetimeStats(drives, { from: new Date(now.getTime() - 7 * 86400_000) });
    expect(ranged.drives).toBe(drives.filter((d) => Date.parse(d.startedAt) >= now.getTime() - 7 * 86400_000).length);
  });
});
