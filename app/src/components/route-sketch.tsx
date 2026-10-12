import { useMemo } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useColors } from '@/theme';

export function projectRoute(points: [number, number][], width: number, height: number, pad: number) {
  if (points.length < 2) return null;
  const midLat = points.reduce((s, p) => s + p[0], 0) / points.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map((p) => p[1] * kx);
  const ys = points.map((p) => -p[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max((maxX - minX) / (width - 2 * pad), (maxY - minY) / (height - 2 * pad), 1e-9);
  const scale = 1 / span;
  const ox = (width - (maxX - minX) * scale) / 2;
  const oy = (height - (maxY - minY) * scale) / 2;
  const pts = xs.map((x, i) => [ox + (x - minX) * scale, oy + (ys[i] - minY) * scale] as const);
  let d = '';
  pts.forEach(([x, y], i) => {
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return { d, start: pts[0], end: pts[pts.length - 1] };
}

export function RouteSketch({
  points,
  width = 64,
  height = 64,
  color,
  strokeWidth = 2.5,
  glow = true,
  dots = true,
  background,
  style,
  endColor,
}: {
  points: [number, number][];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  glow?: boolean;
  dots?: boolean;
  background?: string;
  style?: StyleProp<ViewStyle>;
  endColor?: string;
}) {
  const c = useColors();
  const tint = color ?? c.accent;
  const pad = Math.max(strokeWidth * 3, Math.min(width, height) * 0.14);
  const route = useMemo(() => projectRoute(points, width, height, pad), [points, width, height, pad]);
  const gid = `rs${width}x${height}${tint.replace('#', '')}`;
  return (
    <View style={[{ width, height, backgroundColor: background }, style]}>
      {route ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gid} x1={route.start[0]} y1={route.start[1]} x2={route.end[0]} y2={route.end[1]} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={tint} stopOpacity={0.55} />
              <Stop offset="1" stopColor={endColor ?? tint} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          {glow ? <Path d={route.d} stroke={tint} strokeOpacity={0.18} strokeWidth={strokeWidth * 3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          <Path d={route.d} stroke={`url(#${gid})`} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {dots ? (
            <>
              <Circle cx={route.start[0]} cy={route.start[1]} r={strokeWidth * 1.2} fill={background ?? c.surface} stroke={tint} strokeWidth={strokeWidth * 0.7} />
              <Circle cx={route.end[0]} cy={route.end[1]} r={strokeWidth * 1.5} fill={endColor ?? tint} />
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
