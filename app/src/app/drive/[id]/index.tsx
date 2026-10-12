import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, interpolate, useAnimatedRef, useAnimatedStyle, useScrollOffset } from 'react-native-reanimated';

import { CountUp } from '@/components/drive/count-up';
import { DriveMap } from '@/components/drive/drive-map';
import { SampleTag } from '@/components/drive/drive-row';
import { ElevationChart, elevationProfile } from '@/components/drive/elevation-chart';
import { isSampleDrive, placeLine, SPEED_COLORS } from '@/components/drive/route-math';
import { HexMark } from '@/components/hex';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { PressableScale } from '@/components/pressable-scale';
import { EmptyState, LoadingState } from '@/components/states';
import { Button, Card, Label, SectionTitle, Stat, StatGrid } from '@/components/ui';
import type { Drive, DriveSummary } from '@/core/types';
import { deleteDrive, useDrive, useDrives } from '@/data/drives';
import { useT } from '@/i18n';
import { brand, radius, space, type, useColors } from '@/theme';
import { dateLabel, timeLabel } from '@/ui-lib/date';
import { failure, success, tap } from '@/ui-lib/haptics';
import { useLocalOnly } from '@/ui-lib/remote';
import { useFormat } from '@/ui-lib/units';

const SHEET_OVERLAP = 28;

export default function DriveDetail() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const c = useColors();
  const { t } = useT();
  const full: Drive | null | undefined = useDrive(id);
  const drives: DriveSummary[] = useDrives();
  const summary = drives.find((d) => d.id === id);
  const drive: Drive | DriveSummary | undefined = full ?? summary;
  const [grace, setGrace] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setGrace(false), 1500);
    return () => clearTimeout(t1);
  }, []);

  if (!drive) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: 'center' }}>
        <Stack.Screen options={{ headerTransparent: true }} />
        {grace ? (
          <LoadingState />
        ) : (
          <EmptyState icon="route" title={t('drives.detail.notFoundTitle')} body={t('drives.detail.notFoundBody')} action={t('common.back')} onAction={() => router.back()} />
        )}
      </View>
    );
  }
  return <Detail drive={drive} fresh={fresh === '1'} />;
}

function Detail({ drive, fresh }: { drive: Drive | DriveSummary; fresh: boolean }) {
  const c = useColors();
  const { t, locale } = useT();
  const fmt = useFormat();
  const localOnly = useLocalOnly();
  const { height } = useWindowDimensions();
  const mapH = Math.round(height * 0.55);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollOffset(scrollRef);
  const opened = useRef(false);
  const hasFixes = 'fixes' in drive;
  const profile = hasFixes ? elevationProfile(drive.fixes) : null;
  const sample = isSampleDrive(drive);
  const title = placeLine(drive) ?? t('drives.list.unknownPlace', { time: timeLabel(drive.startedAt) });

  useEffect(() => {
    if (!fresh || opened.current) return;
    opened.current = true;
    success();
    const id = setTimeout(() => router.push(`/drive/${drive.id}/share`), 900);
    return () => clearTimeout(id);
  }, [fresh, drive.id]);

  const mapStyle = useAnimatedStyle(() => {
    const y = offset.value;
    return {
      transform: [{ translateY: y < 0 ? y : y * 0.45 }, { scale: y < 0 ? interpolate(y, [-200, 0], [1.35, 1], 'clamp') : 1 }],
    };
  });

  const num = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const durParts = (s: number) => ({ value: fmt.duration(s), unit: '' });
  const g = t('metrics.g');

  function confirmDelete() {
    Alert.alert(t('drives.list.deleteTitle'), t('drives.list.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          deleteDrive(drive.id).then(() => {
            success();
            router.back();
          }, failure),
      },
    ]);
  }

  const stats: { label: string; value: string; unit?: string; icon: IconName; tint?: string }[] = [
    { label: t('metrics.distance'), ...fmt.distanceParts(drive.distanceM), icon: 'ruler' },
    { label: t('metrics.duration'), value: fmt.duration(drive.durationS), icon: 'clock' },
    { label: t('metrics.moving'), value: fmt.duration(drive.movingS), icon: 'timer' },
    { label: t('metrics.stopped'), value: fmt.duration(drive.stoppedS), icon: 'pauseCircle' },
    { label: t('metrics.stops'), value: num(drive.stops), icon: 'flag' },
    { label: t('metrics.maxSpeed'), ...fmt.speedParts(drive.maxSpeedMps), icon: 'gauge', tint: brand.amber },
    { label: t('metrics.avgSpeed'), ...fmt.speedParts(drive.avgSpeedMps), icon: 'gauge' },
    { label: t('metrics.elevationGain'), ...fmt.elevationParts(drive.elevationGainM), icon: 'arrowUp' },
    { label: t('metrics.elevationLoss'), ...fmt.elevationParts(drive.elevationLossM), icon: 'arrowDown' },
    { label: t('metrics.highest'), ...(drive.highestM == null ? { value: '–' } : fmt.elevationParts(drive.highestM)), icon: 'mountain' },
    { label: t('metrics.steepestClimb'), value: drive.steepestClimbPct == null ? '–' : num(drive.steepestClimbPct, 1), unit: drive.steepestClimbPct == null ? undefined : t('metrics.pct'), icon: 'trendUp' },
    { label: t('metrics.steepestDescent'), value: drive.steepestDescentPct == null ? '–' : num(Math.abs(drive.steepestDescentPct), 1), unit: drive.steepestDescentPct == null ? undefined : t('metrics.pct'), icon: 'trendDown' },
    { label: t('metrics.turnsLeft'), value: num(drive.turnsLeft), icon: 'turnLeft', tint: c.friend },
    { label: t('metrics.turnsRight'), value: num(drive.turnsRight), icon: 'turnRight', tint: c.friend },
    { label: t('metrics.brakePresses'), value: num(drive.brakePresses), icon: 'brake', tint: c.danger },
    { label: t('metrics.laneChanges'), value: num(drive.laneChanges), icon: 'laneChange', tint: c.club },
    { label: t('metrics.maxG'), value: num(drive.maxG, 2), unit: g, icon: 'bolt' },
    { label: t('metrics.maxAccel'), value: num(drive.maxAccelMps2 / 9.80665, 2), unit: g, icon: 'lightning' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ headerTransparent: true, title: '' }} />
      <Animated.ScrollView ref={scrollRef} contentInsetAdjustmentBehavior="never" scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 60 }}>
        <Animated.View style={[{ height: mapH }, mapStyle]}>
          <DriveMap drive={drive} bottomInset={SHEET_OVERLAP} style={{ flex: 1 }} />
        </Animated.View>

        <View style={[styles.sheet, { backgroundColor: c.background, marginTop: -SHEET_OVERLAP }]}>
          <View style={[styles.grabber, { backgroundColor: c.borderStrong }]} />

          <Animated.View entering={FadeInDown.springify().damping(18)} style={{ gap: space.xs }}>
            {fresh ? (
              <View style={styles.eyebrow}>
                <Icon name="checkCircle" size={14} color={c.accentStrong} />
                <Label color={c.accentStrong}>{t('drives.detail.finished')}</Label>
              </View>
            ) : (
              <Label>{dateLabel(drive.startedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Label>
            )}
            <Text style={[type.title, { color: c.text, fontSize: 26, lineHeight: 31 }]} numberOfLines={2} accessibilityRole="header">
              {title}
            </Text>
            <View style={styles.subline}>
              <Text style={[type.callout, { color: c.textSecondary }]}>
                {fresh ? `${dateLabel(drive.startedAt)}  ·  ` : ''}
                {timeLabel(drive.startedAt)} – {timeLabel(drive.endedAt)}
              </Text>
              {sample ? <SampleTag /> : null}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.springify().damping(18).delay(60)} style={styles.heroRow}>
            <View style={{ flex: 1.25 }}>
              <CountUp to={drive.distanceM} parts={fmt.distanceParts} animate={fresh} size="display" />
              <Text style={[type.caption, { color: c.textSecondary }]}>{t('metrics.distance')}</Text>
            </View>
            <View style={[styles.heroDivider, { backgroundColor: c.borderStrong }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.heroSmall}>
                <CountUp to={drive.durationS} parts={durParts} animate={fresh} delay={80} size="valueSmall" />
              </View>
              <Text style={[type.caption, { color: c.textSecondary }]}>{t('metrics.duration')}</Text>
            </View>
            <View style={{ flex: 0.9 }}>
              <View style={styles.heroSmall}>
                <CountUp to={drive.avgSpeedMps} parts={fmt.speedParts} animate={fresh} delay={160} size="valueSmall" />
              </View>
              <Text style={[type.caption, { color: c.textSecondary }]}>{t('metrics.avgSpeed')}</Text>
            </View>
          </Animated.View>

          {hasFixes ? <MapLegend events={drive.events.some((e) => e.kind !== 'stop')} /> : null}

          <Animated.View entering={FadeInDown.springify().damping(18).delay(120)} style={{ gap: space.sm }}>
            <PressableScale
              scaleTo={0.98}
              onPress={() => {
                tap();
                router.push(`/drive/${drive.id}/replay`);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${t('drives.detail.replay')}. ${t('drives.detail.replayBody')}`}
              style={[styles.replay, { backgroundColor: c.hero }]}>
              <View style={styles.replayIcon}>
                <Icon name="replay" size={22} color={brand.emerald} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.headline, { color: '#FFFFFF' }]}>{t('drives.detail.replay')}</Text>
                <Text style={[type.caption, { color: 'rgba(255,255,255,0.62)' }]}>{t('drives.detail.replayBody')}</Text>
              </View>
              <View style={styles.playBtn}>
                <Icon name="play" size={16} color="#03140D" />
              </View>
            </PressableScale>
            <Button title={t('drives.detail.shareCard')} icon="share" variant="secondary" onPress={() => router.push(`/drive/${drive.id}/share`)} />
          </Animated.View>

          <View>
            <SectionTitle title={t('drives.detail.allStats')} />
            <StatGrid columns={2}>
              {stats.map((s) => (
                <Stat key={s.label} label={s.label} value={s.value} unit={s.unit} icon={s.icon} tint={s.tint} small />
              ))}
            </StatGrid>
          </View>

          {profile ? (
            <View>
              <SectionTitle title={t('drives.detail.elevation')} />
              <Card>
                <ElevationChart profile={profile} />
              </Card>
            </View>
          ) : null}

          <View>
            <SectionTitle title={t('drives.detail.territory')} />
            <TerritoryCard drive={drive} localOnly={localOnly && !sample} />
          </View>

          <Button title={t('drives.detail.delete')} icon="trash" variant="danger" onPress={confirmDelete} />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

function MapLegend({ events }: { events: boolean }) {
  const c = useColors();
  const { t } = useT();
  const keys = [
    { label: t('drives.detail.eventBrake'), color: c.danger },
    { label: t('drives.detail.eventTurn'), color: c.friend },
    { label: t('drives.detail.eventLane'), color: c.club },
  ];
  return (
    <View style={{ gap: space.sm, marginTop: -space.sm }}>
      <View style={styles.legend} accessible accessibilityLabel={`${t('drives.detail.speedLegend')}: ${t('drives.detail.slow')} – ${t('drives.detail.fast')}`}>
        <Text style={[type.caption, { color: c.textTertiary }]}>{t('drives.detail.slow')}</Text>
        <View style={styles.legendBar}>
          {SPEED_COLORS.map((col) => (
            <View key={col} style={{ flex: 1, backgroundColor: col }} />
          ))}
        </View>
        <Text style={[type.caption, { color: c.textTertiary }]}>{t('drives.detail.fast')}</Text>
      </View>
      {events ? (
        <View style={styles.legendEvents}>
          {keys.map((k) => (
            <View key={k.label} style={styles.legendEvent}>
              <View style={[styles.legendDot, { backgroundColor: k.color }]} />
              <Text style={[type.caption, { color: c.textSecondary }]}>{k.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TerritoryCard({ drive, localOnly }: { drive: DriveSummary; localOnly: boolean }) {
  const c = useColors();
  const { t, locale } = useT();
  const tr = drive.territory;
  if (localOnly || !tr) {
    return (
      <Card style={styles.terrEmpty}>
        <HexMark size={40} color={c.textSecondary} icon={localOnly ? 'lock' : 'cloud'} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: c.text }]}>{localOnly ? t('drives.detail.localOnlyTitle') : t('drives.detail.notSyncedTitle')}</Text>
          <Text style={[type.caption, { color: c.textSecondary }]}>{localOnly ? t('drives.detail.localOnlyBody') : t('drives.detail.notSyncedBody')}</Text>
        </View>
      </Card>
    );
  }
  const items: { label: string; n: number; color: string; icon: IconName; filled?: boolean }[] = [
    { label: t('drives.detail.claimed'), n: tr.claimed, color: c.accent, icon: 'plus' },
    { label: t('drives.detail.stolen'), n: tr.stolen, color: c.danger, icon: 'swords' },
    { label: t('drives.detail.refreshed'), n: tr.refreshed, color: c.friend, icon: 'refresh' },
    { label: t('drives.detail.held'), n: tr.held, color: c.accent, icon: 'hexagon', filled: true },
  ];
  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.terrGrid}>
        {items.map((it) => (
          <View key={it.label} style={styles.terrItem} accessible accessibilityLabel={`${it.label} ${it.n}`}>
            <HexMark size={38} color={it.color} icon={it.icon} filled={it.filled} />
            <View>
              <Text style={[type.valueSmall, { color: c.text }]}>{it.n.toLocaleString(locale)}</Text>
              <Text style={[type.caption, { color: c.textSecondary }]}>{it.label}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={[type.caption, { color: c.textTertiary }]}>{t('drives.detail.territoryBody')}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.xl, minHeight: 600 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: -space.sm },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  heroDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 6 },
  heroSmall: { height: 52, justifyContent: 'flex-end', paddingBottom: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  legendEvents: { flexDirection: 'row', gap: space.lg },
  legendEvent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendBar: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' },
  replay: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)' },
  replayIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,185,129,0.14)' },
  playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.emerald },
  terrEmpty: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  terrGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg },
  terrItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: space.md },
});
