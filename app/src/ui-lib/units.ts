import { formatDistance, formatDuration, formatElevation, formatSpeed } from '@/core/format';
import { useSettings } from '@/data/settings';

export type Units = 'metric' | 'imperial';

export function useUnits(): Units {
  return useSettings((s) => s.units);
}

export function splitUnit(text: string): { value: string; unit: string } {
  const m = text.trim().match(/^(.*?[\d.,:]+)\s*([^\d\s][^\d]*)?$/);
  if (!m) return { value: text, unit: '' };
  return { value: m[1].trim(), unit: (m[2] ?? '').trim() };
}

export function useFormat() {
  const units = useUnits();
  return {
    units,
    distance: (m: number) => formatDistance(m, units),
    speed: (mps: number) => formatSpeed(mps, units),
    elevation: (m: number) => formatElevation(m, units),
    duration: (s: number) => formatDuration(s),
    distanceParts: (m: number) => splitUnit(formatDistance(m, units)),
    speedParts: (mps: number) => splitUnit(formatSpeed(mps, units)),
    elevationParts: (m: number) => splitUnit(formatElevation(m, units)),
  };
}
