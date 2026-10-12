import { formatInt, useT } from '@/i18n';
import type { Metric } from '@/ui-lib/remote';
import { useFormat } from '@/ui-lib/units';

export type ValueKind = Metric | 'hexes';
export type ValueParts = { value: string; unit: string };

export function useBoardFormat() {
  const f = useFormat();
  const { plural } = useT();
  return (kind: ValueKind, v: number, signed?: '+' | '-'): ValueParts => {
    if (kind === 'distance' || kind === 'longest') return f.distanceParts(v);
    const n = Math.abs(v);
    const unit = kind === 'trophies' ? plural('ranks.unitTrophies', n) : plural('ranks.unitHexes', n);
    const sign = signed === '-' && n > 0 ? '−' : signed === '+' && v > 0 ? '+' : v < 0 ? '−' : '';
    return { value: `${sign}${formatInt(n)}`, unit };
  };
}

export function partsText(p: ValueParts) {
  return p.unit ? `${p.value} ${p.unit}` : p.value;
}
