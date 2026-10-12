import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { formatInt, type Key, t } from '@/i18n';
import { type Palette, tierColor, useColors, withAlpha } from '@/theme';
import { useFormat } from '@/ui-lib/units';
import type { Trophy } from '@/ui-lib/api-types';

import { readableOn } from './avatar';
import { HexMark, hexPath } from './hex';
import type { IconName } from './icon-names';

const ICONS: Record<string, IconName> = {
  first_drive: 'flagCheckered',
  distance_total: 'road',
  distance_single: 'route',
  active_days: 'calendar',
  streak: 'bolt',
  cells_held: 'hexagon',
  steals: 'swords',
  night_drive: 'moon',
  early_bird: 'sunrise',
  climber: 'mountain',
  countries: 'globeEurope',
  club_join: 'people',
};

const FALLBACK_TIERS: Record<string, number[]> = {
  first_drive: [1],
  distance_total: [100_000, 1_000_000, 10_000_000],
  distance_single: [100_000, 300_000, 800_000],
  active_days: [7, 30, 100],
  streak: [3, 7, 30],
  cells_held: [100, 1_000, 10_000],
  steals: [1, 50, 500],
  night_drive: [1],
  early_bird: [1],
  climber: [500, 1_500, 3_000],
  countries: [2, 5, 10],
  club_join: [1],
};

export function trophyIcon(id: string): IconName {
  return ICONS[id] ?? 'trophy';
}

export function fallbackTiers(id: string): number[] | null {
  return FALLBACK_TIERS[id] ?? null;
}

function humanize(id: string) {
  const s = id.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function trophyName(id: string) {
  const key = `profile.items.${id}.name` as Key;
  const s = t(key);
  return s === key ? humanize(id) : s;
}

export function trophyDesc(id: string) {
  const key = `profile.items.${id}.desc` as Key;
  const s = t(key);
  return s === key ? '' : s;
}

export function tierName(tier: number) {
  return t(`profile.trophy.tier${Math.max(0, Math.min(3, tier))}` as Key);
}

export function useTrophyValue() {
  const fmt = useFormat();
  return (id: string, v: number, unit?: string) => {
    if (id === 'climber' || unit === 'elevation') return fmt.elevation(v);
    if (id.startsWith('distance') || unit === 'm') return fmt.distance(v);
    return formatInt(v);
  };
}

export function trophyProgress(tr: Pick<Trophy, 'value' | 'next' | 'tier'>) {
  if (tr.next == null || tr.next <= 0) return tr.tier > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, tr.value / tr.next));
}

function tierFill(c: Palette, tier: number) {
  return tier > 0 ? tierColor(c, tier) : c.textTertiary;
}

export function TrophyBadge({ trophy, size = 72 }: { trophy: Pick<Trophy, 'id' | 'tier' | 'value' | 'next'>; size?: number }) {
  const c = useColors();
  const earned = trophy.tier > 0;
  const color = tierFill(c, trophy.tier);
  const nextColor = tierColor(c, Math.min(3, trophy.tier + 1));
  const progress = trophy.next == null ? (earned ? 1 : 0) : trophyProgress(trophy);
  const ring = hexPath(size, 2);
  const perimeter = size * 3.02;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Path d={ring} fill="none" stroke={withAlpha(trophy.next == null && earned ? color : nextColor, 0.18)} strokeWidth={2.5} />
        {progress > 0 ? (
          <Path
            d={ring}
            fill="none"
            stroke={trophy.next == null && earned ? color : nextColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${perimeter * progress} ${perimeter}`}
          />
        ) : null}
      </Svg>
      <HexMark size={size - 14} color={color} filled={earned} icon={trophyIcon(trophy.id)} iconColor={earned ? readableOn(color) : c.textTertiary} />
    </View>
  );
}
