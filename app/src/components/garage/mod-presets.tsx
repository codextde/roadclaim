import { useId } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { hexPath } from '@/components/hex';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { PressableScale } from '@/components/pressable-scale';
import { useT } from '@/i18n';
import { tap } from '@/ui-lib/haptics';
import { brand, fonts, radius, space, type, useColors } from '@/theme';

import { CarSilhouette } from './car-silhouette';

export const MOD_STYLES = ['widebody', 'stance', 'rally', 'track', 'matte_wrap', 'chrome_delete', 'offroad', 'retro', 'custom'] as const;
export type ModStyle = (typeof MOD_STYLES)[number];

type Preset = { icon: IconName; bg: [string, string]; car: string; ride?: number; wheels?: number; outline?: string };

const PRESETS: Record<ModStyle, Preset> = {
  widebody: { icon: 'arrowsWide', bg: ['#2A1A10', '#0C0A09'], car: '#F97316', ride: 3 },
  stance: { icon: 'arrowDown', bg: ['#1D1A2E', '#0B0A12'], car: '#A78BFA', ride: 6 },
  rally: { icon: 'flag', bg: ['#2B2416', '#100D07'], car: '#F3F4F6', ride: -5, wheels: 1.05 },
  track: { icon: 'flagCheckered', bg: ['#1A1215', '#09080A'], car: '#EF4444', ride: 2 },
  matte_wrap: { icon: 'drop', bg: ['#1B1F1E', '#0A0C0B'], car: '#3E4B45' },
  chrome_delete: { icon: 'contrast', bg: ['#1A1E24', '#08090B'], car: '#0B0C0E' },
  offroad: { icon: 'tree', bg: ['#16231A', '#080E0A'], car: '#84CC16', ride: -9, wheels: 1.22 },
  retro: { icon: 'sunrise', bg: ['#2D1912', '#110907'], car: '#F2C14E' },
  custom: { icon: 'sparkles', bg: ['#0E2A1F', '#06100C'], car: brand.emerald, outline: brand.emerald },
};

export function presetIcon(style: string): IconName {
  return PRESETS[style as ModStyle]?.icon ?? 'sparkles';
}

export function useStyleLabel() {
  const { t } = useT();
  return (style: string) => (MOD_STYLES.includes(style as ModStyle) ? t(`garage.styles.${style as ModStyle}`) : style);
}

function Scene({ style }: { style: ModStyle }) {
  switch (style) {
    case 'widebody':
      return (
        <G>
          <Rect x={0} y={112} width={200} height={28} fill="#FFFFFF" opacity={0.04} />
          <Path d="M60 0 L140 0 L176 112 L24 112 Z" fill="#FFFFFF" opacity={0.05} />
        </G>
      );
    case 'stance':
      return (
        <G>
          <Line x1={8} y1={113} x2={192} y2={113} stroke="#A78BFA" strokeWidth={1.5} opacity={0.6} />
          <Rect x={0} y={113} width={200} height={27} fill="#A78BFA" opacity={0.07} />
        </G>
      );
    case 'rally':
      return (
        <G opacity={0.5}>
          {[18, 34, 26, 44, 12, 52, 38].map((x, i) => (
            <Circle key={i} cx={x} cy={96 + ((i * 7) % 18)} r={2 + (i % 3)} fill="#C8A26A" opacity={0.6 - i * 0.05} />
          ))}
          <Path d="M0 116 Q60 104 120 114 T200 110 L200 140 L0 140 Z" fill="#6B5432" opacity={0.6} />
        </G>
      );
    case 'track':
      return (
        <G>
          {Array.from({ length: 20 }).map((_, i) => (
            <Rect key={i} x={i * 10} y={i % 2 ? 122 : 116} width={10} height={6} fill="#FFFFFF" opacity={0.14} />
          ))}
          <Rect x={0} y={0} width={200} height={3} fill="#EF4444" opacity={0.7} />
        </G>
      );
    case 'matte_wrap':
      return <Path d="M0 30 L200 70" stroke="#FFFFFF" strokeWidth={22} opacity={0.035} />;
    case 'chrome_delete':
      return <Rect x={0} y={108} width={200} height={32} fill="#FFFFFF" opacity={0.03} />;
    case 'offroad':
      return <Path d="M0 84 L34 52 L58 72 L96 34 L130 66 L152 50 L200 86 L200 140 L0 140 Z" fill="#1F3A28" opacity={0.75} />;
    case 'retro':
      return (
        <G>
          <Circle cx={100} cy={70} r={44} fill="#F59E0B" opacity={0.3} />
          {[58, 70, 82, 94, 106].map((y, i) => (
            <Rect key={y} x={40} y={y} width={120} height={2 + i * 0.6} fill="#110907" />
          ))}
        </G>
      );
    case 'custom':
      return (
        <G opacity={0.5}>
          {[
            [26, 22],
            [170, 30],
            [150, 104],
            [36, 108],
          ].map(([x, y], i) => (
            <Path key={i} d={hexPath(16)} transform={`translate(${x - 8} ${y - 8})`} fill="none" stroke={brand.emerald} strokeWidth={1} />
          ))}
        </G>
      );
  }
}

export function PresetArt({ style, width, height, color }: { style: ModStyle; width: number; height: number; color?: string }) {
  const p = PRESETS[style];
  const gid = `bg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const carWidth = width * 0.82;
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Svg width={width} height={height} viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={p.bg[0]} />
            <Stop offset="1" stopColor={p.bg[1]} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={200} height={140} fill={`url(#${gid})`} />
        <Scene style={style} />
      </Svg>
      <CarSilhouette
        color={color ?? p.car}
        outline={p.outline}
        width={carWidth}
        ride={p.ride}
        wheelScale={p.wheels}
        rim={style === 'chrome_delete' ? '#0B0C0E' : style === 'retro' ? '#E5E7EB' : undefined}
        glass={style === 'chrome_delete' ? '#000000' : undefined}
        style={{ position: 'absolute', left: (width - carWidth) / 2, top: height * 0.8 - carWidth * 0.4 }}
      />
    </View>
  );
}

export function PresetTile({
  style,
  selected,
  onPress,
  width,
  showBody = true,
  containerStyle,
  dark,
}: {
  style: ModStyle;
  selected?: boolean;
  onPress: () => void;
  width: number;
  showBody?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  const c = useColors();
  const { t } = useT();
  const fg = dark ? c.onHero : c.text;
  const fg2 = dark ? c.onHeroSecondary : c.textSecondary;
  const artHeight = Math.round(width * 0.62);
  return (
    <PressableScale
      scaleTo={0.96}
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t(`garage.styles.${style}`)}
      accessibilityState={{ selected: !!selected }}
      style={[
        styles.tile,
        { width, backgroundColor: c.surface, borderColor: selected ? c.accent : c.border, borderWidth: selected ? 2 : StyleSheet.hairlineWidth },
        containerStyle,
      ]}>
      <PresetArt style={style} width={width - (selected ? 4 : 0)} height={artHeight} />
      <View style={styles.tileBody}>
        <View style={styles.tileTitle}>
          <Icon name={PRESETS[style].icon} size={13} color={selected ? c.accentStrong : fg2} />
          <Text style={[type.callout, { color: fg, fontFamily: fonts.semibold, flex: 1 }]} numberOfLines={1}>
            {t(`garage.styles.${style}`)}
          </Text>
          {selected ? <Icon name="checkCircle" size={15} color={c.accent} /> : null}
        </View>
        {showBody ? (
          <Text style={[type.caption, { color: fg2 }]} numberOfLines={2}>
            {t(`garage.styleHints.${style}`)}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.md + 2, overflow: 'hidden' },
  tileBody: { padding: space.md, gap: 4 },
  tileTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
