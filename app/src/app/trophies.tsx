import { useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { HexMark } from '@/components/hex';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { EmptyState, ErrorState, LocalOnlyState, Skeleton } from '@/components/states';
import { fallbackTiers, tierName, TrophyBadge, trophyDesc, trophyName, trophyProgress, useTrophyValue } from '@/components/trophy';
import { IconButton, Label, ProgressBar, Screen, SectionTitle, tap } from '@/components/ui';
import { formatInt, useT } from '@/i18n';
import { radius, space, tierColor, type, useColors, withAlpha } from '@/theme';
import { dateLabel } from '@/ui-lib/date';
import { type Trophy, type TrophyDefinition, useLocalOnly, useTrophies, useTrophyDefinitions } from '@/ui-lib/remote';

const COLUMNS = 3;

function chunk<T>(items: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

function Detail({ trophy, def, onClose }: { trophy: Trophy; def: TrophyDefinition | undefined; onClose: () => void }) {
  const c = useColors();
  const { t } = useT();
  const value = useTrophyValue();
  const tiers = def?.tiers ?? fallbackTiers(trophy.id) ?? (trophy.next != null ? [trophy.next] : []);
  const color = trophy.tier > 0 ? tierColor(c, trophy.tier) : c.textSecondary;
  const nextTier = Math.min(3, trophy.tier + 1);
  const show = (v: number) => value(trophy.id, v, def?.unit);
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOut.duration(140)}
      layout={LinearTransition.springify().damping(20)}
      style={[styles.detail, { backgroundColor: c.surface, borderColor: withAlpha(color, 0.4) }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Label color={color}>{tierName(trophy.tier)}</Label>
          <Text style={[type.headline, { color: c.text }]}>{trophyName(trophy.id)}</Text>
          {trophyDesc(trophy.id) ? <Text style={[type.callout, { color: c.textSecondary }]}>{trophyDesc(trophy.id)}</Text> : null}
        </View>
        <IconButton icon="close" label={t('profile.trophy.close')} onPress={onClose} size={30} />
      </View>

      {trophy.next != null ? (
        <View style={{ gap: space.sm }}>
          <View style={styles.progressHead}>
            <Text style={[type.caption, { color: c.textSecondary }]}>{t('profile.trophy.nextTier', { tier: tierName(nextTier) })}</Text>
            <Text style={[type.mono, { color: c.text }]}>{t('profile.trophy.progress', { value: show(trophy.value), next: show(trophy.next) })}</Text>
          </View>
          <ProgressBar value={trophyProgress(trophy)} color={tierColor(c, nextTier)} />
        </View>
      ) : trophy.tier > 0 ? (
        <View style={styles.maxed}>
          <Icon name="crown" size={14} color={color} />
          <Text style={[type.callout, { color: c.text }]}>{t('profile.trophy.maxed')}</Text>
        </View>
      ) : null}

      {tiers.length > 1 ? (
        <View style={{ gap: space.sm }}>
          <Label>{t('profile.trophy.tiers')}</Label>
          <View style={styles.ladder}>
            {tiers.slice(0, 3).map((threshold, i) => {
              const tier = i + 1;
              const reached = trophy.tier >= tier;
              const tc = tierColor(c, tier);
              return (
                <View key={tier} style={[styles.rung, { backgroundColor: reached ? withAlpha(tc, 0.14) : c.surfaceSunken, borderColor: reached ? withAlpha(tc, 0.5) : c.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <HexMark size={18} color={tc} filled={reached} />
                    <Text style={[type.caption, { color: reached ? c.text : c.textSecondary }]}>{tierName(tier)}</Text>
                  </View>
                  <Text style={[type.mono, { color: reached ? c.text : c.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                    {show(threshold)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {trophy.earnedAt ? <Text style={[type.caption, { color: c.textTertiary }]}>{t('profile.trophy.earnedOn', { date: dateLabel(trophy.earnedAt) })}</Text> : null}
    </Animated.View>
  );
}

function Tile({ trophy, selected, onPress }: { trophy: Trophy; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ expanded: selected }}
      accessibilityLabel={`${trophyName(trophy.id)}, ${tierName(trophy.tier)}`}
      style={[styles.tile, selected && { backgroundColor: c.surfaceRaised }]}>
      <TrophyBadge trophy={trophy} size={76} />
      <Text style={[type.caption, { color: trophy.tier > 0 ? c.text : c.textSecondary, textAlign: 'center' }]} numberOfLines={2}>
        {trophyName(trophy.id)}
      </Text>
    </PressableScale>
  );
}

function Section({
  title,
  items,
  defs,
  selected,
  onSelect,
}: {
  title: string;
  items: Trophy[];
  defs: Map<string, TrophyDefinition>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={{ marginBottom: space.xl }}>
      <SectionTitle title={title} />
      {chunk(items, COLUMNS).map((row) => {
        const open = row.find((x) => x.id === selected);
        return (
          <Animated.View key={row[0].id} layout={LinearTransition.springify().damping(20)}>
            <View style={styles.row}>
              {row.map((tr) => (
                <Tile key={tr.id} trophy={tr} selected={tr.id === selected} onPress={() => onSelect(tr.id === selected ? null : tr.id)} />
              ))}
              {Array.from({ length: COLUMNS - row.length }).map((_, i) => (
                <View key={`f${i}`} style={{ flex: 1 }} />
              ))}
            </View>
            {open ? <Detail trophy={open} def={defs.get(open.id)} onClose={() => onSelect(null)} /> : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

export default function Trophies() {
  const c = useColors();
  const { t } = useT();
  const localOnly = useLocalOnly();
  const { data, error, loading, reload } = useTrophies();
  const definitions = useTrophyDefinitions();
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (localOnly) {
    return (
      <Screen>
        <LocalOnlyState body={t('profile.trophy.localBody')} />
      </Screen>
    );
  }

  const items: Trophy[] = data?.items ?? [];
  const defs = new Map<string, TrophyDefinition>((definitions.data?.items ?? []).map((d: TrophyDefinition) => [d.id, d]));
  const earned = items.filter((x) => x.tier > 0).sort((a, b) => b.tier - a.tier || (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''));
  const progress = items.filter((x) => x.tier === 0).sort((a, b) => trophyProgress(b) - trophyProgress(a));
  const tally = [3, 2, 1].map((tier) => ({ tier, n: items.filter((x) => x.tier === tier).length }));

  async function refresh() {
    setRefreshing(true);
    await Promise.all([reload(), definitions.reload()].map((p) => Promise.resolve(p).catch(() => undefined)));
    setRefreshing(false);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} />}>
      {loading && !data ? (
        <View style={{ gap: space.xl }}>
          <Skeleton height={96} radius={radius.lg} />
          {[0, 1].map((r) => (
            <View key={r} style={styles.row}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.tile, { gap: space.sm }]}>
                  <Skeleton width={72} height={72} radius={22} />
                  <Skeleton width={64} height={10} />
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState icon="trophy" title={t('profile.trophy.emptyTitle')} body={t('profile.trophy.emptyBody')} tint={c.gold} />
      ) : (
        <>
          <Animated.View entering={FadeIn.duration(260)} style={[styles.summary, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Label>{t('metrics.trophies')}</Label>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={[type.display, { color: c.text }]}>{formatInt(earned.length)}</Text>
                <Text style={[type.unit, { fontSize: 18, color: c.textSecondary }]}>/ {formatInt(items.length)}</Text>
              </View>
            </View>
            <View style={{ gap: space.sm }}>
              {tally.map(({ tier, n }) => (
                <View key={tier} style={styles.tallyRow} accessible accessibilityLabel={`${tierName(tier)} ${n}`}>
                  <HexMark size={16} color={tierColor(c, tier)} filled />
                  <Text style={[type.caption, { color: c.textSecondary, width: 52 }]}>{tierName(tier)}</Text>
                  <Text style={[type.mono, { color: c.text, minWidth: 20, textAlign: 'right' }]}>{n}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
          <Animated.View entering={FadeInDown.springify().damping(18).delay(80)}>
            <Section title={t('profile.trophy.earnedSection')} items={earned} defs={defs} selected={selected} onSelect={setSelected} />
            <Section title={t('profile.trophy.progressSection')} items={progress} defs={defs} selected={selected} onSelect={setSelected} />
          </Animated.View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: space.xl },
  tallyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', gap: space.xs },
  tile: { flex: 1, alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: radius.md },
  detail: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.lg, marginTop: space.xs, marginBottom: space.md },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  maxed: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ladder: { flexDirection: 'row', gap: space.sm },
  rung: { flex: 1, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, gap: 6 },
});
