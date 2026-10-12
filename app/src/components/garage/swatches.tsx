import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { readableOn } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { tap } from '@/ui-lib/haptics';
import { space, type, useColors } from '@/theme';

export function Swatches({
  options,
  value,
  onChange,
  size = 40,
  showLabel,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  size?: number;
  showLabel?: boolean;
}) {
  const c = useColors();
  const selected = options.find((o) => o.value.toLowerCase() === value.toLowerCase());
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {options.map((o) => {
          const active = o === selected;
          return (
            <PressableScale
              key={o.value}
              scaleTo={0.88}
              onPress={() => {
                if (active) return;
                tap();
                onChange(o.value);
              }}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ selected: active }}
              hitSlop={4}
              style={[
                styles.ring,
                { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: active ? o.value : 'transparent' },
              ]}>
              <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: o.value, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                {active ? (
                  <Animated.View entering={ZoomIn.springify().damping(14)}>
                    <Icon name="check" size={Math.round(size * 0.42)} color={readableOn(o.value)} weight="bold" />
                  </Animated.View>
                ) : null}
              </View>
            </PressableScale>
          );
        })}
      </View>
      {showLabel && selected ? <Text style={[type.caption, { color: c.textSecondary, marginLeft: space.xs }]}>{selected.label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  ring: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
