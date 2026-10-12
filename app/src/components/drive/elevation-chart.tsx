import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import type { Fix } from '@/core/types';
import { useT } from '@/i18n';
import { space, type, useColors } from '@/theme';
import { useFormat } from '@/ui-lib/units';

import { distanceM, thin } from './route-math';

const H = 128;
const PAD_TOP = 14;
const PAD_BOTTOM = 6;

export function elevationProfile(fixes: Fix[]) {
  const pts: { d: number; alt: number }[] = [];
  let d = 0;
  let prev: Fix | null = null;
  for (const f of fixes) {
    if (prev) d += distanceM(prev.lat, prev.lng, f.lat, f.lng);
    prev = f;
    if (f.alt != null && Number.isFinite(f.alt)) pts.push({ d, alt: f.alt });
  }
  if (pts.length < 8 || d < 200) return null;
  const sampled = thin(pts, 160);
  const smooth = sampled.map((p, i) => {
    const w = sampled.slice(Math.max(0, i - 3), i + 4);
    return { d: p.d, alt: w.reduce((s, x) => s + x.alt, 0) / w.length };
  });
  const alts = smooth.map((p) => p.alt);
  const min = Math.min(...alts);
  const max = Math.max(...alts);
  if (max - min < 4) return null;
  return { pts: smooth, min, max, total: d };
}

export function ElevationChart({ profile }: { profile: NonNullable<ReturnType<typeof elevationProfile>> }) {
  const c = useColors();
  const { t } = useT();
  const fmt = useFormat();
  const [w, setW] = useState(0);
  const { pts, min, max, total } = profile;
  const span = max - min;
  const x = (d: number) => (d / total) * w;
  const y = (alt: number) => PAD_TOP + (1 - (alt - min) / span) * (H - PAD_TOP - PAD_BOTTOM);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.d).toFixed(1)},${y(p.alt).toFixed(1)}`).join('');
  const area = `${line}L${w},${H}L0,${H}Z`;
  const peak = pts.reduce((a, b) => (b.alt > a.alt ? b : a), pts[0]);

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.legend}>
        <Text style={[type.caption, { color: c.textSecondary }]}>{t('drives.detail.elevationRange', { min: fmt.elevation(min), max: fmt.elevation(max) })}</Text>
      </View>
      <View style={{ height: H }} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityLabel={`${t('drives.detail.elevation')}: ${t('drives.detail.elevationRange', { min: fmt.elevation(min), max: fmt.elevation(max) })}`}>
        {w > 0 ? (
          <Svg width={w} height={H}>
            <Defs>
              <LinearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.accent} stopOpacity={0.38} />
                <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Line x1={0} x2={w} y1={y(max)} y2={y(max)} stroke={c.borderStrong} strokeDasharray="3 4" />
            <Line x1={0} x2={w} y1={y(min)} y2={y(min)} stroke={c.borderStrong} strokeDasharray="3 4" />
            <Path d={area} fill="url(#elevFill)" />
            <Path d={line} stroke={c.accent} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(peak.d)} cy={y(peak.alt)} r={4} fill={c.background} stroke={c.accent} strokeWidth={2} />
          </Svg>
        ) : null}
        <Text style={[type.mono, styles.maxLabel, { color: c.textSecondary }]}>{fmt.elevation(max)}</Text>
      </View>
      <View style={styles.axis}>
        <Text style={[type.mono, { fontSize: 12, color: c.textTertiary }]}>{fmt.distance(0)}</Text>
        <Text style={[type.mono, { fontSize: 12, color: c.textTertiary }]}>{fmt.distance(total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', justifyContent: 'space-between' },
  maxLabel: { position: 'absolute', right: 0, top: -4, fontSize: 12 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
