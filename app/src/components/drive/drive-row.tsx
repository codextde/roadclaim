import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PressableScale } from '@/components/pressable-scale';
import { RouteSketch } from '@/components/route-sketch';
import { Pill } from '@/components/ui';
import type { DriveSummary } from '@/core/types';
import { useT } from '@/i18n';
import { brand, fonts, radius, space, type, useColors } from '@/theme';
import { timeLabel } from '@/ui-lib/date';
import { impact, tap } from '@/ui-lib/haptics';
import { useFormat } from '@/ui-lib/units';

import { hexGridPath, isSampleDrive, placeLine } from './route-math';

const TILE = 76;
const tileGrid = hexGridPath(TILE, TILE, 9);

export function RouteTile({ points, size = TILE }: { points: [number, number][]; size?: number }) {
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Path d={size === TILE ? tileGrid : hexGridPath(size, size, 9)} stroke="#FFFFFF" strokeOpacity={0.045} strokeWidth={1} fill="none" />
      </Svg>
      <RouteSketch points={points} width={size} height={size} color={brand.emerald} endColor="#6EE7B7" strokeWidth={2.4} background="#101215" style={{ backgroundColor: 'transparent' }} />
    </View>
  );
}

export function SampleTag() {
  const c = useColors();
  const { t } = useT();
  return <Pill text={t('drives.samples.tag')} color={c.friend} bg={c.friendSoft} />;
}

export function TerritoryBadges({ drive }: { drive: DriveSummary }) {
  const c = useColors();
  const { t, plural } = useT();
  const tr = drive.territory;
  return (
    <View style={styles.badges}>
      {isSampleDrive(drive) ? <SampleTag /> : null}
      {tr && tr.claimed > 0 ? <Pill icon="hexagon" text={plural('drives.list.claimed', tr.claimed)} color={c.accentStrong} bg={c.accentSoft} /> : null}
      {tr && tr.stolen > 0 ? <Pill icon="swords" text={plural('drives.list.stolen', tr.stolen)} color={c.danger} bg={c.dangerSoft} /> : null}
      {!drive.uploaded && !isSampleDrive(drive) ? (
        <View style={styles.unsynced}>
          <View style={[styles.unsyncedDot, { borderColor: c.textTertiary }]} />
          <Text style={[type.caption, { color: c.textTertiary, fontSize: 11.5 }]}>{t('drives.list.notSynced')}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function DriveRow({ drive, onPress, onLongPress }: { drive: DriveSummary; onPress: () => void; onLongPress: () => void }) {
  const c = useColors();
  const { t } = useT();
  const fmt = useFormat();
  const route = placeLine(drive) ?? t('drives.list.unknownPlace', { time: timeLabel(drive.startedAt) });
  const dist = fmt.distanceParts(drive.distanceM);
  const duration = fmt.duration(drive.durationS);
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => {
        tap();
        onPress();
      }}
      onLongPress={() => {
        impact('medium');
        onLongPress();
      }}
      delayLongPress={380}
      accessibilityRole="button"
      accessibilityLabel={t('drives.list.rowLabel', { route, distance: fmt.distance(drive.distanceM), duration })}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <RouteTile points={drive.preview} />
      <View style={styles.body}>
        <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
          {route}
        </Text>
        <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={1}>
          {timeLabel(drive.startedAt)} – {timeLabel(drive.endedAt)}
          <Text style={{ color: c.textTertiary }}>{'  ·  '}</Text>
          {duration}
        </Text>
        <TerritoryBadges drive={drive} />
      </View>
      <View style={styles.distance}>
        <Text style={[type.valueSmall, { color: c.text, fontSize: 24, lineHeight: 26 }]} numberOfLines={1}>
          {dist.value}
        </Text>
        <Text style={[type.unit, { color: c.textTertiary, fontSize: 12, fontFamily: fonts.numMedium }]}>{dist.unit}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md + 2,
    padding: space.sm + 2,
    paddingRight: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tile: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#101215' },
  body: { flex: 1, gap: 3, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3, minHeight: 4 },
  unsynced: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  unsyncedDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.2, borderStyle: 'dashed' },
  distance: { alignItems: 'flex-end', minWidth: 52 },
});
