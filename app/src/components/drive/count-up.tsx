import { useEffect, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Easing, useAnimatedReaction, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Value } from '@/components/ui';

export function CountUp({
  to,
  parts,
  animate,
  delay = 0,
  size = 'value',
  color,
  style,
}: {
  to: number;
  parts: (n: number) => { value: string; unit: string };
  animate: boolean;
  delay?: number;
  size?: 'hero' | 'display' | 'value' | 'valueSmall';
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useSharedValue(animate ? 0 : 1);
  const [p, setP] = useState(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    progress.value = withDelay(delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [animate, delay, progress]);

  useAnimatedReaction(
    () => Math.round(progress.value * 60) / 60,
    (now, before) => {
      if (now !== before) scheduleOnRN(setP, now);
    },
  );

  const shown = parts(to * p);
  return <Value value={shown.value} unit={shown.unit} size={size} color={color} style={style} />;
}
