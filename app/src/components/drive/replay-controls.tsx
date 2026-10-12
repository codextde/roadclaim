import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { PressableScale } from '@/components/pressable-scale';
import { useT } from '@/i18n';
import { brand, fonts, radius, space, type } from '@/theme';
import { tap } from '@/ui-lib/haptics';

export const RATES = [0.25, 0.5, 1, 2] as const;
export type Rate = (typeof RATES)[number];

export function Scrubber({
  progress,
  value,
  onStart,
  onSeek,
  onEnd,
}: {
  progress: SharedValue<number>;
  value: number;
  onStart: () => void;
  onSeek: (p: number) => void;
  onEnd: () => void;
}) {
  const { t } = useT();
  const width = useSharedValue(1);
  const active = useSharedValue(0);
  const clamp = (x: number, w: number) => Math.max(0, Math.min(1, x / Math.max(1, w)));

  const pan = Gesture.Pan()
    .minDistance(0)
    .hitSlop({ top: 16, bottom: 16 })
    .runOnJS(true)
    .onBegin((e) => {
      active.value = 1;
      onStart();
      onSeek(clamp(e.x, width.value));
    })
    .onUpdate((e) => onSeek(clamp(e.x, width.value)))
    .onFinalize(() => {
      active.value = 0;
      onEnd();
    });

  const fill = useAnimatedStyle(() => ({ width: progress.value * width.value }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * width.value - 9 }, { scale: active.value ? 1.25 : 1 }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.track}
        onLayout={(e) => {
          width.value = e.nativeEvent.layout.width;
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('drives.replay.scrubber')}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const step = e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1;
          onSeek(Math.max(0, Math.min(1, value + step)));
        }}>
        <View style={styles.rail}>
          <Animated.View style={[styles.fill, fill]} />
        </View>
        <Animated.View style={[styles.thumb, thumb]} />
      </View>
    </GestureDetector>
  );
}

export function RateChips({ value, onChange }: { value: Rate; onChange: (r: Rate) => void }) {
  const { t, locale } = useT();
  return (
    <View style={styles.chips}>
      {RATES.map((r) => {
        const label = `${r.toLocaleString(locale)}×`;
        const on = r === value;
        return (
          <PressableScale
            key={r}
            onPress={() => {
              if (on) return;
              tap();
              onChange(r);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t('drives.replay.speedChip', { speed: label })}
            style={[styles.chip, on && styles.chipOn]}>
            <Text style={[type.mono, { fontSize: 13, color: on ? '#03140D' : 'rgba(255,255,255,0.78)', fontFamily: on ? fonts.numBold : fonts.numMedium }]}>{label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 28, justifyContent: 'center' },
  rail: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: brand.emerald },
  thumb: {
    position: 'absolute',
    left: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
    borderColor: brand.emerald,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  chips: { flexDirection: 'row', gap: 6, padding: 3, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.08)' },
  chip: { minWidth: 44, height: 30, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: brand.emerald },
});
