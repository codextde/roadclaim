import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useColors, withAlpha } from '@/theme';

import { Icon } from './icon';
import type { IconName } from './icon-names';

export function hexPath(size: number, inset = 0, corner = 0.16) {
  const r = size / 2 - inset;
  const cx = size / 2;
  const cy = size / 2;
  const pts = Array.from({ length: 6 }).map((_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
  const k = corner;
  let d = '';
  for (let i = 0; i < 6; i++) {
    const p = pts[i];
    const prev = pts[(i + 5) % 6];
    const next = pts[(i + 1) % 6];
    const a = [p[0] + (prev[0] - p[0]) * k, p[1] + (prev[1] - p[1]) * k];
    const b = [p[0] + (next[0] - p[0]) * k, p[1] + (next[1] - p[1]) * k];
    d += `${i === 0 ? 'M' : 'L'}${a[0].toFixed(2)},${a[1].toFixed(2)} Q${p[0].toFixed(2)},${p[1].toFixed(2)} ${b[0].toFixed(2)},${b[1].toFixed(2)} `;
  }
  return `${d}Z`;
}

export function HexMark({
  size = 44,
  color,
  icon,
  filled,
  iconColor,
  style,
  progress,
}: {
  size?: number;
  color: string;
  icon?: IconName;
  filled?: boolean;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
  progress?: number;
}) {
  const c = useColors();
  const id = `hx${color.replace('#', '')}${filled ? 'f' : 'o'}`;
  const outer = hexPath(size, 1);
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={filled ? 1 : 0.24} />
            <Stop offset="1" stopColor={color} stopOpacity={filled ? 0.78 : 0.1} />
          </LinearGradient>
        </Defs>
        <Path d={outer} fill={`url(#${id})`} stroke={withAlpha(color, filled ? 0 : 0.45)} strokeWidth={1} />
        {progress != null && progress > 0 && progress < 1 ? (
          <Path d={outer} fill="none" stroke={color} strokeWidth={2} strokeDasharray={`${size * 3.1 * progress} ${size * 4}`} strokeLinecap="round" />
        ) : null}
      </Svg>
      {icon ? <Icon name={icon} size={Math.round(size * 0.4)} color={iconColor ?? (filled ? c.onAccent : color)} /> : null}
    </View>
  );
}
