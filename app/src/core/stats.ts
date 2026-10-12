import type { DriveSummary, LifetimeStats } from './types';

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const monthKey = (iso: string) => dayKey(iso).slice(0, 7);

export function inRange(d: DriveSummary, range?: { from?: Date; to?: Date }) {
  const t = Date.parse(d.startedAt);
  if (range?.from && t < range.from.getTime()) return false;
  if (range?.to && t >= range.to.getTime()) return false;
  return true;
}

export function lifetimeStats(drives: DriveSummary[], range?: { from?: Date; to?: Date }): LifetimeStats {
  const days = new Set<string>();
  const countries = new Set<string>();
  const stats: LifetimeStats = {
    distanceM: 0,
    drives: 0,
    activeDays: 0,
    durationS: 0,
    longestM: 0,
    elevationGainM: 0,
    brakePresses: 0,
    turns: 0,
    laneChanges: 0,
    countries: 0,
  };
  for (const d of drives) {
    if (!inRange(d, range)) continue;
    stats.drives++;
    stats.distanceM += d.distanceM;
    stats.durationS += d.durationS;
    stats.longestM = Math.max(stats.longestM, d.distanceM);
    stats.elevationGainM += d.elevationGainM;
    stats.brakePresses += d.brakePresses;
    stats.turns += d.turnsLeft + d.turnsRight;
    stats.laneChanges += d.laneChanges;
    days.add(dayKey(d.startedAt));
    if (d.countryCode) countries.add(d.countryCode);
  }
  stats.activeDays = days.size;
  stats.countries = countries.size;
  stats.elevationGainM = Math.round(stats.elevationGainM);
  return stats;
}

export function monthlyRecap(drives: DriveSummary[], month: string) {
  const inMonth = drives.filter((d) => monthKey(d.startedAt) === month);
  const [y, m] = month.split('-').map(Number);
  const stats = lifetimeStats(inMonth);
  const perDay = new Map<string, number>();
  for (const d of inMonth) perDay.set(dayKey(d.startedAt), (perDay.get(dayKey(d.startedAt)) ?? 0) + d.distanceM);
  let topDay: string | null = null;
  for (const [day, m2] of perDay) if (topDay == null || m2 > (perDay.get(topDay) ?? 0)) topDay = day;

  let cellsClaimed = 0;
  if (inMonth.some((d) => d.territory)) {
    for (const d of inMonth) cellsClaimed += (d.territory?.claimed ?? 0) + (d.territory?.stolen ?? 0);
  } else {
    const start = new Date(y, m - 1, 1).getTime();
    const before = new Set<string>();
    for (const d of drives) if (Date.parse(d.startedAt) < start) d.cells.forEach((c) => before.add(c));
    const fresh = new Set<string>();
    for (const d of inMonth) for (const c of d.cells) if (!before.has(c)) fresh.add(c);
    cellsClaimed = fresh.size;
  }
  return { stats, topDay, cellsClaimed, drives: inMonth };
}
