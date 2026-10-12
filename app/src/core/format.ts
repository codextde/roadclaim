export type Units = 'metric' | 'imperial';

const M_PER_MILE = 1609.344;
const FT_PER_M = 3.28084;

const nf = (digits: number) => new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const formatters = [nf(0), nf(1), nf(2)];
const num = (x: number, digits = 0) => formatters[digits].format(x);

export function distanceParts(m: number, units: Units): { value: string; unit: string } {
  if (units === 'imperial') {
    const mi = m / M_PER_MILE;
    if (mi < 0.1) return { value: num(m * FT_PER_M), unit: 'ft' };
    return { value: num(mi, mi < 100 ? 1 : 0), unit: 'mi' };
  }
  if (m < 1000) return { value: num(m), unit: 'm' };
  const km = m / 1000;
  return { value: num(km, km < 100 ? 1 : 0), unit: 'km' };
}

export function formatDistance(m: number, units: Units): string {
  const { value, unit } = distanceParts(m, units);
  return `${value} ${unit}`;
}

export function formatDuration(s: number): string {
  const total = Math.max(0, Math.round(s));
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  if (h > 0) return min > 0 ? `${h} h ${min} min` : `${h} h`;
  if (min > 0) return `${min} min`;
  return `${total} s`;
}

export function formatClock(s: number): string {
  const total = Math.max(0, Math.round(s));
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(min)}:${pad(sec)}` : `${min}:${pad(sec)}`;
}

export function formatSpeed(mps: number, units: Units): string {
  return units === 'imperial' ? `${num(mps * 2.236936)} mph` : `${num(mps * 3.6)} km/h`;
}

export function formatElevation(m: number, units: Units): string {
  return units === 'imperial' ? `${num(m * FT_PER_M)} ft` : `${num(m)} m`;
}

export function formatPercent(x: number): string {
  return `${num(x, 1)} %`;
}
