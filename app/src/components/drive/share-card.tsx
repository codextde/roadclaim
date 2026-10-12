import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { hexPath } from '@/components/hex';
import { RouteSketch } from '@/components/route-sketch';
import type { DriveSummary } from '@/core/types';
import type { CardStyle } from '@/data/settings';
import { useT } from '@/i18n';
import { fonts } from '@/theme';
import { dateLabel } from '@/ui-lib/date';
import { useFormat } from '@/ui-lib/units';

import { CARD_W, type CardFormat, cardHeight } from './card-export';
import { hexGridPath, placeLine } from './route-math';

export type { CardStyle };

export type Look = {
  bg: string;
  text: string;
  sub: string;
  faint: string;
  route: string;
  routeEnd: string;
  grid: string | null;
  glow: boolean;
  chipBg: string;
  chipFg: string;
  stroke: number;
};

export const looks: Record<CardStyle, Look> = {
  dark: {
    bg: '#07090A',
    text: '#FFFFFF',
    sub: 'rgba(255,255,255,0.64)',
    faint: 'rgba(255,255,255,0.4)',
    route: '#10B981',
    routeEnd: '#6EE7B7',
    grid: 'rgba(255,255,255,0.055)',
    glow: true,
    chipBg: 'rgba(16,185,129,0.16)',
    chipFg: '#34D399',
    stroke: 4,
  },
  light: {
    bg: '#F2F3F5',
    text: '#0B0D10',
    sub: '#59616B',
    faint: '#8C939C',
    route: '#059669',
    routeEnd: '#047857',
    grid: 'rgba(11,13,16,0.06)',
    glow: false,
    chipBg: 'rgba(5,150,105,0.12)',
    chipFg: '#047857',
    stroke: 3.6,
  },
  minimal: {
    bg: '#10B981',
    text: '#03140D',
    sub: 'rgba(3,20,13,0.7)',
    faint: 'rgba(3,20,13,0.5)',
    route: '#03140D',
    routeEnd: '#03140D',
    grid: null,
    glow: false,
    chipBg: 'rgba(3,20,13,0.12)',
    chipFg: '#03140D',
    stroke: 1.6,
  },
};

export function CardTexture({ look, height }: { look: Look; height: number }) {
  return (
    <Svg width={CARD_W} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="cardGlow" cx="50%" cy="42%" r="60%">
          <Stop offset="0" stopColor={look.route} stopOpacity={0.2} />
          <Stop offset="1" stopColor={look.route} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {look.grid ? <Path d={hexGridPath(CARD_W, height, 16)} stroke={look.grid} strokeWidth={1} fill="none" /> : null}
      {look.glow ? <Rect x={0} y={0} width={CARD_W} height={height} fill="url(#cardGlow)" /> : null}
    </Svg>
  );
}

export function Wordmark({ look }: { look: Look }) {
  const { t } = useT();
  return (
    <View style={styles.brand}>
      <Svg width={18} height={18}>
        <Path d={hexPath(18, 0.5, 0.2)} fill={look.route === look.text ? look.text : look.route} />
        <Path d={hexPath(18, 5.5, 0.2)} fill={look.bg} />
      </Svg>
      <Text style={[styles.wordmark, { color: look.text }]}>{t('common.appName').toUpperCase()}</Text>
    </View>
  );
}

export function HexChip({ look, text }: { look: Look; text: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: look.chipBg }]}>
      <Svg width={11} height={11}>
        <Path d={hexPath(11, 0, 0.2)} fill={look.chipFg} />
      </Svg>
      <Text style={[styles.chipText, { color: look.chipFg }]}>{text}</Text>
    </View>
  );
}

export function ShareCard({ drive, cardStyle, format, detailed }: { drive: DriveSummary; cardStyle: CardStyle; format: CardFormat; detailed: boolean }) {
  const { t, plural, locale } = useT();
  const fmt = useFormat();
  const look = looks[cardStyle];
  const h = cardHeight(format);
  const story = format === 'story';
  const minimal = cardStyle === 'minimal';
  const [box, setBox] = useState({ w: 0, h: 0 });
  const dist = fmt.distanceParts(drive.distanceM);
  const place = placeLine(drive) ?? drive.city;
  const claimed = drive.territory?.claimed ?? 0;
  const bigSize = (minimal ? 118 : 88) * (story ? 1.3 : 1) * (detailed && !story ? 0.82 : 1);
  const num = (n: number) => Math.round(n).toLocaleString(locale);

  const details = [
    { label: t('metrics.brakePresses'), value: num(drive.brakePresses) },
    { label: t('metrics.turns'), value: num(drive.turnsLeft + drive.turnsRight) },
    { label: t('metrics.stops'), value: num(drive.stops) },
    { label: t('metrics.laneChanges'), value: num(drive.laneChanges) },
    { label: t('metrics.stopped'), value: fmt.duration(drive.stoppedS) },
    { label: t('metrics.elevationGain'), value: fmt.elevation(drive.elevationGainM) },
  ];

  return (
    <View style={[styles.card, { height: h, backgroundColor: look.bg, padding: story ? 30 : 24 }]}>
      <CardTexture look={look} height={h} />
      <View style={styles.header}>
        <Wordmark look={look} />
        <Text style={[styles.date, { color: look.sub }]}>{dateLabel(drive.startedAt)}</Text>
      </View>

      <View style={{ flex: 1, marginVertical: story ? 18 : 8 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {box.w > 0 && box.h > 10 ? (
          <RouteSketch
            points={drive.preview}
            width={box.w}
            height={box.h}
            color={look.route}
            endColor={look.routeEnd}
            strokeWidth={look.stroke}
            glow={look.glow}
            dots={!minimal}
            background={look.bg}
            style={{ backgroundColor: 'transparent' }}
          />
        ) : null}
      </View>

      {detailed ? (
        <View style={[styles.details, { borderColor: look.faint, marginBottom: story ? 22 : 10 }]}>
          {details.map((d) => (
            <View key={d.label} style={styles.detail}>
              <Text style={[styles.detailValue, { color: look.text, fontSize: story ? 24 : 18 }]} numberOfLines={1} adjustsFontSizeToFit>
                {d.value}
              </Text>
              <Text style={[styles.detailLabel, { color: look.faint }]} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {claimed > 0 ? <HexChip look={look} text={plural('drives.share.claimedChip', claimed)} /> : null}

      <View style={styles.bigRow}>
        <Text style={[styles.big, { color: look.text, fontSize: bigSize, lineHeight: bigSize * 1.02 }]} numberOfLines={1} adjustsFontSizeToFit>
          {dist.value}
        </Text>
        <Text style={[styles.bigUnit, { color: look.sub, fontSize: bigSize * 0.28 }]}>{dist.unit}</Text>
      </View>
      <View style={styles.footer}>
        <Text style={[styles.foot, { color: look.text }]}>{fmt.duration(drive.durationS)}</Text>
        {place ? (
          <>
            <View style={[styles.sep, { backgroundColor: look.faint }]} />
            <Text style={[styles.foot, { color: look.sub, flex: 1 }]} numberOfLines={1}>
              {place}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_W, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  wordmark: { fontFamily: fonts.bold, fontSize: 12.5, letterSpacing: 2.6 },
  date: { fontFamily: fonts.medium, fontSize: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, marginBottom: 2 },
  chipText: { fontFamily: fonts.semibold, fontSize: 11.5 },
  details: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, rowGap: 8 },
  detail: { width: '33.33%', paddingRight: 6 },
  detailValue: { fontFamily: fonts.numSemibold, fontVariant: ['tabular-nums'] },
  detailLabel: { fontFamily: fonts.semibold, fontSize: 8.5, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 1 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  big: { fontFamily: fonts.numBold, letterSpacing: -2, fontVariant: ['tabular-nums'], flexShrink: 1 },
  bigUnit: { fontFamily: fonts.numMedium },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  foot: { fontFamily: fonts.semibold, fontSize: 14 },
  sep: { width: 4, height: 4, borderRadius: 2 },
});
