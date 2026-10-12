import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import type { DriveSummary } from '@/core/types';
import { useMonthlyRecap } from '@/data/drives';
import { useT } from '@/i18n';
import { brand, radius, space, type, useColors } from '@/theme';
import { previousMonthKey } from '@/ui-lib/date';
import { tap } from '@/ui-lib/haptics';
import { useFormat } from '@/ui-lib/units';

import { parseDay, projectRoutes } from './route-math';

const SKETCH = 56;

export function RecapBanner() {
  const c = useColors();
  const { t, plural, locale } = useT();
  const fmt = useFormat();
  const [month] = useState(() => previousMonthKey());
  const recap = useMonthlyRecap(month);
  if (new Date().getDate() > 7 || !recap || recap.stats.drives === 0) return null;
  const paths = projectRoutes(
    recap.drives.slice(0, 40).map((d: DriveSummary) => d.preview),
    SKETCH,
    SKETCH,
    8,
  );
  const name = parseDay(`${month}-01`).toLocaleDateString(locale, { month: 'long' });
  return (
    <Animated.View entering={FadeInDown.springify().damping(18).delay(120)}>
      <PressableScale
        scaleTo={0.98}
        onPress={() => {
          tap();
          router.push(`/recap?month=${month}`);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${t('drives.recapBanner.title', { month: name })}. ${t('drives.recapBanner.open')}`}
        style={[styles.banner, { backgroundColor: c.surface, borderColor: c.accentGlow }]}>
        <View style={styles.sketch}>
          <Svg width={SKETCH} height={SKETCH}>
            {paths.map((d, i) => (
              <Path key={i} d={d} stroke={brand.emerald} strokeOpacity={0.75} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.label, { color: c.accentStrong }]}>{t('drives.recapBanner.eyebrow')}</Text>
          <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
            {t('drives.recapBanner.title', { month: name })}
          </Text>
          <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={1}>
            {plural('drives.recapBanner.body', recap.stats.drives, { distance: fmt.distance(recap.stats.distanceM) })}
          </Text>
        </View>
        <Icon name="chevronRight" size={13} color={c.textTertiary} />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md + 2, padding: space.md, paddingRight: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  sketch: { width: SKETCH, height: SKETCH, borderRadius: radius.md, backgroundColor: '#101215', overflow: 'hidden' },
});
