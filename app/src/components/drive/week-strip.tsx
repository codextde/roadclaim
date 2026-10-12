import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { Label, Value } from '@/components/ui';
import type { DriveSummary, LifetimeStats } from '@/core/types';
import { useLifetimeStats } from '@/data/drives';
import { useT } from '@/i18n';
import { radius, space, spring, type, useColors } from '@/theme';
import { dayKey, startOfWeek } from '@/ui-lib/date';
import { useFormat } from '@/ui-lib/units';

const BAR_H = 44;

function Bar({ value, active, index }: { value: number; active: boolean; index: number }) {
  const c = useColors();
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(index * 40, withSpring(value, spring.soft));
  }, [h, value, index]);
  const style = useAnimatedStyle(() => ({ height: Math.max(4, h.value * BAR_H) }));
  return (
    <View style={styles.barSlot}>
      <Animated.View style={[styles.bar, { backgroundColor: value > 0 ? (active ? c.accent : c.accentGlow) : c.surfaceSunken }, style]} />
    </View>
  );
}

export function WeekStrip({ drives }: { drives: DriveSummary[] }) {
  const c = useColors();
  const { t, locale } = useT();
  const fmt = useFormat();
  const [from] = useState(() => startOfWeek());
  const stats: LifetimeStats = useLifetimeStats({ from });
  const today = dayKey(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const key = dayKey(d);
    return { key, label: d.toLocaleDateString(locale, { weekday: 'narrow' }), meters: drives.filter((x) => dayKey(x.startedAt) === key).reduce((s, x) => s + x.distanceM, 0) };
  });
  const max = Math.max(1, ...days.map((d) => d.meters));
  const dist = fmt.distanceParts(stats.distanceM);

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Label>{t('drives.week.title')}</Label>
      <View style={styles.stats}>
        <View style={{ flex: 1.3 }} accessible accessibilityLabel={`${t('drives.week.distance')} ${fmt.distance(stats.distanceM)}`}>
          <Value value={dist.value} unit={dist.unit} size="value" />
          <Text style={[type.caption, { color: c.textSecondary }]}>{t('drives.week.distance')}</Text>
        </View>
        <View style={{ flex: 0.8 }} accessible accessibilityLabel={`${t('drives.week.drives')} ${stats.drives}`}>
          <Value value={String(stats.drives)} size="value" />
          <Text style={[type.caption, { color: c.textSecondary }]}>{t('drives.week.drives')}</Text>
        </View>
        <View style={{ flex: 1.2 }} accessible accessibilityLabel={`${t('drives.week.time')} ${fmt.duration(stats.durationS)}`}>
          <View style={{ height: 34, justifyContent: 'flex-end', paddingBottom: 2 }}>
            <Value value={fmt.duration(stats.durationS)} size="valueSmall" />
          </View>
          <Text style={[type.caption, { color: c.textSecondary }]}>{t('drives.week.time')}</Text>
        </View>
      </View>
      <View style={styles.chart} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {days.map((d, i) => (
          <View key={d.key} style={styles.col}>
            <Bar value={d.meters / max} active={d.key === today} index={i} />
            <Text style={[type.caption, { fontSize: 11, color: d.key === today ? c.text : c.textTertiary }]}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  stats: { flexDirection: 'row', gap: space.md },
  chart: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  barSlot: { height: BAR_H, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 5 },
});
