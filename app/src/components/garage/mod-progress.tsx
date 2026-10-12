import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOutUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { hexPath } from '@/components/hex';
import { useT } from '@/i18n';
import { radius, space, type, useColors, withAlpha } from '@/theme';
import { clock } from '@/ui-lib/date';

import { CarSilhouette } from './car-silhouette';

const STEPS = ['progress1', 'progress2', 'progress3', 'progress4', 'progress5', 'progress6'] as const;
const W = 300;
const H = W * 0.4;

function HexField() {
  const c = useColors();
  const size = 26;
  const cells: [number, number][] = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 13; col++) cells.push([col * size * 0.9 + (row % 2 ? size * 0.45 : 0) - 8, row * size * 0.78 - 6]);
  return (
    <Svg width={W + 40} height={H + 60} style={StyleSheet.absoluteFill}>
      {cells.map(([x, y], i) => (
        <Path key={i} d={hexPath(size, 2)} transform={`translate(${x} ${y})`} fill="none" stroke={withAlpha(c.accent, 0.08 + ((i * 37) % 11) / 110)} strokeWidth={1} />
      ))}
    </Svg>
  );
}

export function ModProgress({ color }: { color: string }) {
  const c = useColors();
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scan = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    scan.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.cubic) }), -1, true);
    pulse.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
    const started = Date.now();
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      setStep(Math.min(STEPS.length - 1, Math.floor(s / 4)));
    }, 500);
    return () => clearInterval(id);
  }, [scan, pulse]);

  const reveal = useAnimatedStyle(() => ({ width: scan.value * W }));
  const line = useAnimatedStyle(() => ({ transform: [{ translateX: scan.value * W - 1 }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.4 }));

  return (
    <Animated.View entering={FadeIn.duration(350)} style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={t(`garage.${STEPS[step]}`)}>
      <View style={[styles.stage, { backgroundColor: c.hero }]}>
        <HexField />
        <Animated.View style={[styles.glow, { backgroundColor: c.accentGlow }, glow]} />
        <View style={{ width: W, height: H }}>
          <CarSilhouette color={color} outline={withAlpha('#FFFFFF', 0.28)} width={W} shadow={false} />
          <Animated.View style={[styles.reveal, reveal]}>
            <CarSilhouette color={color} width={W} />
          </Animated.View>
          <Animated.View style={[styles.line, { backgroundColor: c.accentStrong, shadowColor: c.accent }, line]} />
        </View>
      </View>
      <View style={styles.copy}>
        <Animated.Text key={step} entering={FadeInDown.springify().damping(18)} exiting={FadeOutUp.duration(180)} style={[type.headline, { color: c.text, textAlign: 'center' }]}>
          {t(`garage.${STEPS[step]}`)}
        </Animated.Text>
        <Text style={[type.mono, { color: c.accentStrong }]}>{clock(elapsed)}</Text>
        <Text style={[type.caption, { color: c.textSecondary, textAlign: 'center', maxWidth: 280 }]}>{t('garage.progressHint')}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.xl, paddingTop: space.xl },
  stage: { width: W + 40, height: H + 60, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glow: { position: 'absolute', width: 220, height: 60, borderRadius: 60, bottom: 24, transform: [{ scaleX: 1.4 }], opacity: 0.5 },
  reveal: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  line: { position: 'absolute', top: -14, bottom: -6, width: 2, borderRadius: 1, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  copy: { alignItems: 'center', gap: space.sm, minHeight: 90 },
});
