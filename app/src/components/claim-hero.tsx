import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, interpolate, type SharedValue, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { brand } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Pt = [number, number];
type Cell = { key: string; x: number; y: number };

function hexD(x: number, y: number, r: number) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    d += `${i === 0 ? 'M' : 'L'}${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)} `;
  }
  return `${d}Z`;
}

function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

function build(width: number, height: number, r: number) {
  const w = Math.sqrt(3) * r;
  const rowStep = 1.5 * r;
  const cells: Cell[] = [];
  for (let row = -1; row * rowStep < height + r; row++) {
    for (let col = -1; col * w < width + w; col++) {
      cells.push({ key: `${col}:${row}`, x: col * w + (row % 2 ? w / 2 : 0), y: row * rowStep });
    }
  }
  const curve: [Pt, Pt, Pt, Pt] = [
    [-r, height * 0.92],
    [width * 0.42, height * 1.02],
    [width * 0.38, height * 0.18],
    [width + r, height * 0.3],
  ];
  const samples = 90;
  const route: Pt[] = Array.from({ length: samples + 1 }).map((_, i) => bezier(...curve, i / samples));
  const lengths = [0];
  for (let i = 1; i < route.length; i++) lengths.push(lengths[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  const total = lengths[lengths.length - 1];

  const claimed: (Cell & { at: number })[] = [];
  const seen = new Set<string>();
  route.forEach((p, i) => {
    let best = cells[0];
    let bestD = Infinity;
    for (const cell of cells) {
      const d = (cell.x - p[0]) ** 2 + (cell.y - p[1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = cell;
      }
    }
    if (!seen.has(best.key)) {
      seen.add(best.key);
      claimed.push({ ...best, at: lengths[i] / total });
    }
  });

  const rivals = cells
    .filter((cell) => !seen.has(cell.key))
    .map((cell, i) => ({ cell, n: (i * 2654435761) % 97 }))
    .filter(({ n, cell }) => n < 9 && cell.y > r && cell.y < height - r)
    .map(({ cell, n }) => ({ ...cell, color: n < 4 ? brand.blue : brand.amber }));

  const d = route.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return { cells, claimed, rivals, d, total, xs: route.map((p) => p[0]), ys: route.map((p) => p[1]) };
}

function ClaimedHex({ d, at, progress }: { d: string; at: number; progress: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({
    fillOpacity: interpolate(progress.value, [at - 0.01, at + 0.05], [0, 0.85], 'clamp'),
    strokeOpacity: interpolate(progress.value, [at - 0.01, at + 0.03], [0, 1], 'clamp'),
  }));
  return <AnimatedPath d={d} fill={brand.emerald} stroke="#6EE7B7" strokeWidth={1} animatedProps={props} />;
}

export function ClaimHero({ width, height, radius = 24 }: { width: number; height: number; radius?: number }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  const art = build(width, height, radius);
  const { xs, ys, total } = art;

  useEffect(() => {
    if (reduced) return;
    progress.value = withDelay(350, withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.cubic) }));
  }, [progress, reduced]);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: total * (1 - progress.value) }));
  const headProps = useAnimatedProps(() => {
    const f = progress.value * (xs.length - 1);
    const i = Math.min(xs.length - 2, Math.floor(f));
    const k = f - i;
    return {
      cx: xs[i] + (xs[i + 1] - xs[i]) * k,
      cy: ys[i] + (ys[i + 1] - ys[i]) * k,
      opacity: progress.value >= 1 ? 0 : 1,
    };
  });

  return (
    <View style={{ width, height }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <G>
          {art.cells.map((cell) => (
            <Path key={cell.key} d={hexD(cell.x, cell.y, radius - 1.5)} fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
          ))}
          {art.rivals.map((cell) => (
            <Path key={`r${cell.key}`} d={hexD(cell.x, cell.y, radius - 1.5)} fill={cell.color} fillOpacity={0.22} stroke={cell.color} strokeOpacity={0.4} strokeWidth={1} />
          ))}
          {art.claimed.map((cell) => (
            <ClaimedHex key={`c${cell.key}`} d={hexD(cell.x, cell.y, radius - 1.5)} at={cell.at} progress={progress} />
          ))}
        </G>
        <AnimatedPath d={art.d} fill="none" stroke={brand.emerald} strokeOpacity={0.35} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${total} ${total}`} animatedProps={lineProps} />
        <AnimatedPath d={art.d} fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${total} ${total}`} animatedProps={lineProps} />
        <AnimatedCircle r={7} fill="#FFFFFF" stroke={brand.emerald} strokeWidth={3} animatedProps={headProps} />
      </Svg>
    </View>
  );
}
