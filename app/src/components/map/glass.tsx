import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { radius, useColors, useIsDark } from '@/theme';

export function Glass({ children, style, round = radius.lg }: { children: ReactNode; style?: StyleProp<ViewStyle>; round?: number }) {
  const c = useColors();
  const dark = useIsDark();
  return (
    <View style={[styles.shadow, { borderRadius: round, shadowColor: c.shadow }, style]}>
      <View style={[styles.clip, { borderRadius: round, borderColor: c.borderStrong }]}>
        {Platform.OS === 'ios' ? (
          <BlurView tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} intensity={85} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.mapScrim }]} />
        )}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  clip: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
});
