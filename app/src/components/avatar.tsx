import { type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { fonts, useColors } from '@/theme';

export function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({ name, color, size = 40, ring, style }: { name: string; color: string; size?: number; ring?: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: ring ? Math.max(2, size / 22) : 0,
          borderColor: ring ?? 'transparent',
        },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no">
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.38, color: readableOn(color), letterSpacing: -0.3 }} allowFontScaling={false}>
        {initials(name)}
      </Text>
      <View style={{ position: 'absolute', inset: 0, borderRadius: size / 2, borderWidth: 1, borderColor: c.border }} />
    </View>
  );
}

export function readableOn(hex: string) {
  const h = hex.replace('#', '');
  if (h.length < 6) return '#FFFFFF';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#0B0D10' : '#FFFFFF';
}
