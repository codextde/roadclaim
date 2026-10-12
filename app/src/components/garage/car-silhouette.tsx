import { useId } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { withAlpha } from '@/theme';

export const CAR_BODY =
  'M14 58 C10 58 8 54 8 50 L9 44 C10 39 14 36 20 35 L50 31 C58 22 70 15 84 14 L116 13 C128 13 138 20 150 29 L178 33 C186 34 192 39 192 46 L192 52 C192 56 190 58 186 58 L174 58 A18 18 0 0 0 138 58 L68 58 A18 18 0 0 0 32 58 Z';
const WINDOWS = 'M56 31 C63 24 72 19 84 18 L101 18 L101 31 Z M106 18 L116 17.5 C125 17.5 133 22 142 29.5 L106 31 Z';

export function CarSilhouette({
  color,
  width = 200,
  outline,
  ride = 0,
  wheelScale = 1,
  glass = 'rgba(8,10,12,0.55)',
  rim = 'rgba(255,255,255,0.18)',
  shadow = true,
  style,
}: {
  color: string;
  width?: number;
  outline?: string;
  ride?: number;
  wheelScale?: number;
  glass?: string;
  rim?: string;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const gid = `car${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const r = 13 * wheelScale;
  const height = width * 0.4;
  return (
    <Svg width={width} height={height} viewBox="0 0 200 80" style={style}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={outline ? 0 : 0.28} />
          <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={outline ? 0 : 0.22} />
        </LinearGradient>
      </Defs>
      {shadow ? <Ellipse cx={100} cy={59 + r - 1} rx={88} ry={3.5} fill="#000000" opacity={0.28} /> : null}
      <G transform={`translate(0 ${ride})`}>
        <Path d={CAR_BODY} fill={outline ? 'none' : color} stroke={outline ?? withAlpha('#000000', 0.18)} strokeWidth={outline ? 1.4 : 0.6} strokeLinejoin="round" />
        {outline ? null : <Path d={CAR_BODY} fill={`url(#${gid})`} />}
        <Path d={WINDOWS} fill={outline ? 'none' : glass} stroke={outline} strokeWidth={outline ? 1 : 0} />
      </G>
      {[50, 156].map((x) => (
        <G key={x}>
          <Circle cx={x} cy={58} r={r} fill={outline ? 'none' : '#111316'} stroke={outline} strokeWidth={outline ? 1.4 : 0} />
          <Circle cx={x} cy={58} r={r * 0.55} fill={outline ? 'none' : rim} stroke={outline ?? withAlpha('#FFFFFF', 0.35)} strokeWidth={outline ? 1 : 0.8} />
        </G>
      ))}
    </Svg>
  );
}
