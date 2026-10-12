import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { initials, readableOn } from '@/components/avatar';
import { HexMark } from '@/components/hex';
import { fonts, withAlpha } from '@/theme';

export const CLUB_COLORS = [
  { id: 'amber', hex: '#F59E0B' },
  { id: 'emerald', hex: '#10B981' },
  { id: 'blue', hex: '#3B82F6' },
  { id: 'red', hex: '#EF4444' },
  { id: 'pink', hex: '#EC4899' },
  { id: 'violet', hex: '#8B5CF6' },
  { id: 'teal', hex: '#14B8A6' },
  { id: 'orange', hex: '#F97316' },
  { id: 'lime', hex: '#84CC16' },
  { id: 'slate', hex: '#64748B' },
] as const;

export function ClubHex({ name, color, size = 44, halo, style }: { name: string; color: string; size?: number; halo?: boolean; style?: StyleProp<ViewStyle> }) {
  const label = initials(name || '?');
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]} accessibilityElementsHidden importantForAccessibility="no">
      {halo ? <HexMark size={size * 1.32} color={withAlpha(color, 0.9)} style={{ position: 'absolute' }} /> : null}
      <HexMark size={size} color={color} filled style={{ position: 'absolute' }} />
      <Text style={{ fontFamily: fonts.numBold, fontSize: size * 0.36, letterSpacing: 0.5, color: readableOn(color) }} allowFontScaling={false}>
        {label}
      </Text>
    </View>
  );
}
