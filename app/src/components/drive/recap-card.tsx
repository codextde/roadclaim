import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { DriveSummary, LifetimeStats } from '@/core/types';
import { useT } from '@/i18n';
import { fonts } from '@/theme';
import { dateLabel, dayKey, monthLabel } from '@/ui-lib/date';
import { useFormat } from '@/ui-lib/units';

import { CARD_W, type CardFormat, cardHeight } from './card-export';
import { parseDay, projectRoutes } from './route-math';
import { CardTexture, type Look, Wordmark } from './share-card';

export type Recap = { stats: LifetimeStats; topDay: string | null; cellsClaimed: number; drives: DriveSummary[] };

export function monthDays(month: string, drives: DriveSummary[]) {
  const first = parseDay(`${month}-01`);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const byDay = new Map<string, number>();
  for (const d of drives) byDay.set(dayKey(d.startedAt), (byDay.get(dayKey(d.startedAt)) ?? 0) + d.distanceM);
  const days = Array.from({ length: count }, (_, i) => byDay.get(dayKey(new Date(first.getFullYear(), first.getMonth(), i + 1))) ?? 0);
  return { offset, days, max: Math.max(1, ...days) };
}

export function Heatmap({ month, drives, cell, gap, look }: { month: string; drives: DriveSummary[]; cell: number; gap: number; look: Look }) {
  const { offset, days, max } = monthDays(month, drives);
  const slots = [...Array.from({ length: offset }, () => -1), ...days];
  return (
    <View style={{ width: cell * 7 + gap * 6, flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {slots.map((m, i) => (
        <View
          key={i}
          style={{
            width: cell,
            height: cell,
            borderRadius: cell * 0.28,
            backgroundColor: m < 0 ? 'transparent' : m === 0 ? look.chipBg : look.route,
            opacity: m <= 0 ? 1 : 0.35 + 0.65 * Math.sqrt(m / max),
          }}
        />
      ))}
    </View>
  );
}

function Routes({ drives, look }: { drives: DriveSummary[]; look: Look }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const paths = box.w > 0 ? projectRoutes(drives.map((d) => d.preview), box.w, box.h, 6) : [];
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box.w > 0 ? (
        <Svg width={box.w} height={box.h}>
          {look.glow
            ? paths.map((d, i) => <Path key={`g${i}`} d={d} stroke={look.route} strokeOpacity={0.14} strokeWidth={look.stroke * 2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />)
            : null}
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={look.route} strokeOpacity={0.85} strokeWidth={Math.max(1.2, look.stroke * 0.5)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

export function RecapCard({ month, recap, look, format }: { month: string; recap: Recap; look: Look; format: CardFormat }) {
  const { t, locale } = useT();
  const fmt = useFormat();
  const h = cardHeight(format);
  const story = format === 'story';
  const dist = fmt.distanceParts(recap.stats.distanceM);
  const num = (n: number) => Math.round(n).toLocaleString(locale);
  const big = story ? 104 : 64;
  const topDay = recap.topDay ? dateLabel(parseDay(recap.topDay), { day: 'numeric', month: 'short' }) : null;

  const stats = [
    { label: t('drives.recap.drives'), value: num(recap.stats.drives) },
    { label: t('drives.recap.activeDays'), value: num(recap.stats.activeDays) },
    { label: t('drives.recap.longest'), value: fmt.distance(recap.stats.longestM) },
    ...(story
      ? [
          { label: t('drives.recap.topDay'), value: topDay ?? '–' },
          { label: t('metrics.hours'), value: fmt.duration(recap.stats.durationS) },
          { label: t('drives.recap.cellsClaimed'), value: num(recap.cellsClaimed) },
        ]
      : [{ label: t('drives.recap.cellsClaimed'), value: num(recap.cellsClaimed) }]),
  ];

  return (
    <View style={[styles.card, { height: h, backgroundColor: look.bg, padding: story ? 30 : 24 }]}>
      <CardTexture look={look} height={h} />
      <View style={styles.header}>
        <Wordmark look={look} />
        <Text style={[styles.eyebrow, { color: look.sub }]}>{t('drives.recap.eyebrow').toUpperCase()}</Text>
      </View>
      <View style={[styles.monthRow, { marginTop: story ? 22 : 10 }]}>
        <Text style={[styles.month, { color: look.text, fontSize: story ? 32 : 22 }]} numberOfLines={1}>
          {monthLabel(month)}
        </Text>
        {!story && topDay ? (
          <Text style={[styles.topDay, { color: look.sub }]} numberOfLines={1}>
            {t('drives.recap.topDay')} · {topDay}
          </Text>
        ) : null}
      </View>

      {story ? (
        <>
          <Routes drives={recap.drives} look={look} />
          <View style={{ alignItems: 'center', marginVertical: 18 }}>
            <Heatmap month={month} drives={recap.drives} cell={30} gap={6} look={look} />
          </View>
        </>
      ) : (
        <View style={styles.middle}>
          <Heatmap month={month} drives={recap.drives} cell={15} gap={3} look={look} />
          <Routes drives={recap.drives} look={look} />
        </View>
      )}

      <View style={styles.bigRow}>
        <Text style={[styles.big, { color: look.text, fontSize: big, lineHeight: big * 1.02 }]} numberOfLines={1} adjustsFontSizeToFit>
          {dist.value}
        </Text>
        <Text style={[styles.bigUnit, { color: look.sub, fontSize: big * 0.3 }]}>{dist.unit}</Text>
      </View>
      <View style={[styles.stats, { borderColor: look.faint }]}>
        {stats.map((s) => (
          <View key={s.label} style={{ width: story ? '33.33%' : '25%', paddingRight: 6 }}>
            <Text style={[styles.statValue, { color: look.text, fontSize: story ? 22 : 16 }]} numberOfLines={1} adjustsFontSizeToFit>
              {s.value}
            </Text>
            <Text style={[styles.statLabel, { color: look.faint }]} numberOfLines={2}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_W, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.6 },
  monthRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  month: { fontFamily: fonts.bold, letterSpacing: -0.6, flexShrink: 1 },
  topDay: { fontFamily: fonts.medium, fontSize: 11.5 },
  middle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, marginVertical: 10 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  big: { fontFamily: fonts.numBold, letterSpacing: -1.5, fontVariant: ['tabular-nums'], flexShrink: 1 },
  bigUnit: { fontFamily: fonts.numMedium },
  stats: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 4, rowGap: 10 },
  statValue: { fontFamily: fonts.numSemibold, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: fonts.semibold, fontSize: 8.5, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 1 },
});
