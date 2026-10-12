import * as Application from 'expo-application';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '@/components/avatar';
import { hexPath } from '@/components/hex';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { isOfflineError, Skeleton } from '@/components/states';
import { TrophyBadge, trophyName, trophyProgress } from '@/components/trophy';
import { Card, Group, IconButton, Label, Row, Screen, SectionTitle, Segmented, tap, ToggleRow } from '@/components/ui';
import { deleteDrive, useDrives, useLifetimeStats } from '@/data/drives';
import { useSettings } from '@/data/settings';
import { formatInt, useT } from '@/i18n';
import { fonts, radius, space, type, useColors, withAlpha } from '@/theme';
import { failure, success } from '@/ui-lib/haptics';
import { type Privacy, remote, type Trophy, setLocalOnly, useLocalOnly, useMyStats, useSession, useTrophies } from '@/ui-lib/remote';
import { useFormat } from '@/ui-lib/units';
import { setAutoDetect, usePermissions } from '@/tracking/recorder';
import { requestAutoDetect } from '@/ui-lib/auto-detect';

const enter = (i: number) => FadeInDown.springify().damping(18).delay(i * 60);
const LINE = 'rgba(255,255,255,0.08)';

function ClusterCell({ label, value, unit, last }: { label: string; value: string; unit?: string; last?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.cell, !last && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: LINE }]} accessible accessibilityLabel={`${label} ${value} ${unit ?? ''}`}>
      <Text style={[type.label, styles.cellLabel, { color: c.onHeroSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.cellValue}>
        <Text style={[type.valueSmall, { color: c.onHero }]} numberOfLines={1}>
          {value}
        </Text>
        {unit ? <Text style={[type.unit, { fontSize: 12.5, color: c.onHeroSecondary }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function HoneycombDecor({ color }: { color: string }) {
  const s = 30;
  const w = s * 0.866;
  const cells = [
    [0, 0, 0.05],
    [1, 0, 0.22],
    [2, 0, 0.08],
    [0.5, 1, 0.12],
    [1.5, 1, 0.4],
    [2.5, 1, 0.05],
    [1, 2, 0.16],
    [2, 2, 0.06],
  ] as const;
  return (
    <Svg width={w * 3.5 + 4} height={s * 2.6} style={styles.decor} pointerEvents="none">
      {cells.map(([x, y, o], i) => (
        <Path key={i} d={hexPath(s, 1.5)} transform={`translate(${x * w}, ${y * s * 0.75})`} fill={color} fillOpacity={o} stroke={color} strokeOpacity={o + 0.08} strokeWidth={1} />
      ))}
    </Svg>
  );
}

export default function ProfileTab() {
  const c = useColors();
  const { t, plural, locale } = useT();
  const fmt = useFormat();
  const session = useSession();
  const me = session.me;
  const localOnly = useLocalOnly();
  const stats = useLifetimeStats();
  const season = useMyStats('season');
  const trophies = useTrophies();
  const drives = useDrives();
  const units = useSettings((s) => s.units);
  const autoDetect = useSettings((s) => s.autoDetect);
  const perms = usePermissions();
  const stopAfterMin = useSettings((s) => s.stopAfterMin);
  const theme = useSettings((s) => s.theme);
  const cars = useSettings((s) => s.cars);
  const activeCarId = useSettings((s) => s.activeCarId);
  const [privacyOverride, setPrivacyOverride] = useState<Partial<Privacy>>({});
  const [busy, setBusy] = useState<'local' | 'delete' | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const online = !!me && !localOnly;
  const privacy = { ...(me?.privacy ?? { localOnly, hideFromLeaderboards: false, cloudBackup: false }), ...privacyOverride };
  const activeCar = cars.find((x) => x.id === activeCarId) ?? null;
  const name = me?.displayName || t('profile.header.localName');

  const distance = fmt.distanceParts(stats.distanceM);
  const longest = fmt.distanceParts(stats.longestM);
  const elevation = fmt.elevationParts(stats.elevationGainM);
  const hours = stats.durationS / 3600;
  const hoursText = hours < 100 ? hours.toLocaleString(locale, { maximumFractionDigits: 1 }) : formatInt(hours);

  const grid = [
    [
      { label: t('metrics.drives'), value: formatInt(stats.drives) },
      { label: t('metrics.activeDays'), value: formatInt(stats.activeDays) },
      { label: t('metrics.hours'), value: hoursText, unit: t('profile.stats.hoursUnit') },
    ],
    [
      { label: t('metrics.longest'), value: longest.value, unit: longest.unit },
      { label: t('metrics.elevationGain'), value: elevation.value, unit: elevation.unit },
      { label: t('metrics.countries'), value: formatInt(stats.countries) },
    ],
    [
      { label: t('metrics.brakePresses'), value: formatInt(stats.brakePresses) },
      { label: t('metrics.turns'), value: formatInt(stats.turns) },
      { label: t('metrics.laneChanges'), value: formatInt(stats.laneChanges) },
    ],
  ];

  const trophyItems: Trophy[] = trophies.data?.items ?? [];
  const earnedCount = trophyItems.filter((x) => x.tier > 0).length;
  const preview = [...trophyItems].sort((a, b) => b.tier - a.tier || trophyProgress(b) - trophyProgress(a)).slice(0, 4);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([session.refresh(), season.reload(), trophies.reload()].map((p) => Promise.resolve(p).catch(() => undefined)));
    setRefreshing(false);
  }

  async function updatePrivacy(patch: Partial<Privacy>) {
    setPrivacyOverride((p) => ({ ...p, ...patch }));
    try {
      await remote.updateMe({ privacy: patch });
      await session.refresh().catch(() => undefined);
      success();
    } catch {
      failure();
      Alert.alert(t('common.errorTitle'), t('profile.settings.saveFailed'));
    } finally {
      setPrivacyOverride((p) => {
        const next = { ...p };
        for (const k of Object.keys(patch) as (keyof Privacy)[]) delete next[k];
        return next;
      });
    }
  }

  async function applyLocal(on: boolean) {
    setBusy('local');
    try {
      await setLocalOnly(on, { remote: !!me });
      await session.refresh().catch(() => undefined);
      success();
    } catch {
      failure();
      Alert.alert(t('common.errorTitle'), t('profile.settings.saveFailed'));
    } finally {
      setBusy(null);
    }
  }

  function toggleLocal(on: boolean) {
    if (!on) return applyLocal(false);
    Alert.alert(t('profile.settings.localOnlyConfirmTitle'), t('profile.settings.localOnlyConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.settings.localOnlyConfirm'), onPress: () => applyLocal(true) },
    ]);
  }

  async function wipe() {
    setBusy('delete');
    try {
      if (me) await remote.deleteMe();
    } catch (e) {
      failure();
      setBusy(null);
      Alert.alert(isOfflineError(e) ? t('common.offlineTitle') : t('common.errorTitle'), t('profile.settings.deleteFailed'));
      return;
    }
    for (const d of drives) await deleteDrive(d.id).catch(() => undefined);
    useSettings.setState({ onboarded: false, cars: [], activeCarId: null, localOnly: false });
    success();
    setBusy(null);
  }

  function confirmDelete() {
    Alert.alert(t('profile.settings.deleteTitle'), me ? t('profile.settings.deleteBody') : t('profile.settings.deleteLocalBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('profile.settings.deleteConfirmTitle'), t('profile.settings.deleteConfirmBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('profile.settings.deleteFinal'), style: 'destructive', onPress: wipe },
          ]),
      },
    ]);
  }

  const setStop = (n: number) => useSettings.setState({ stopAfterMin: Math.min(10, Math.max(2, n)) });

  return (
    <Screen refreshControl={online ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} /> : undefined}>
      <Animated.View entering={enter(0)} style={styles.header}>
        <View style={[styles.avatarGlow, { shadowColor: c.accent }]}>
          <Avatar name={name} color={me?.avatarColor ?? c.accent} size={84} ring={c.accent} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[type.title, { color: c.text, fontSize: 26, lineHeight: 31 }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[type.mono, { color: c.textSecondary }]} numberOfLines={1}>
            {me ? `@${me.username}` : t('profile.header.localHandle')}
          </Text>
          <View style={styles.pills}>
            {me?.club ? (
              <PressableScale
                onPress={() => {
                  tap();
                  router.push('/clubs');
                }}
                accessibilityRole="button"
                accessibilityLabel={me.club.name}
                style={[styles.pill, { backgroundColor: c.clubSoft }]}>
                <Icon name="flag" size={10} color={c.club} />
                <Text style={[styles.pillText, { color: c.club }]} numberOfLines={1}>
                  {me.club.name}
                </Text>
              </PressableScale>
            ) : null}
            {activeCar ? (
              <PressableScale
                onPress={() => {
                  tap();
                  router.navigate('/garage');
                }}
                accessibilityRole="button"
                accessibilityLabel={activeCar.nickname ?? `${activeCar.make} ${activeCar.model}`}
                style={[styles.pill, { backgroundColor: c.surfaceRaised }]}>
                <View style={[styles.carDot, { backgroundColor: activeCar.color, borderColor: c.borderStrong }]} />
                <Text style={[styles.pillText, { color: c.text }]} numberOfLines={1}>
                  {activeCar.nickname ?? `${activeCar.make} ${activeCar.model}`}
                </Text>
              </PressableScale>
            ) : null}
          </View>
        </View>
        {me ? <IconButton icon="pencil" label={t('profile.header.editA11y')} onPress={() => router.push('/settings/profile')} size={38} /> : null}
      </Animated.View>

      <Animated.View entering={enter(1)} style={[styles.cluster, { backgroundColor: c.hero }]}>
        <HoneycombDecor color={c.accent} />
        <View style={styles.clusterTop}>
          <View style={[styles.liveDot, { backgroundColor: c.accent }]} />
          <Text style={[type.label, { color: c.onHeroSecondary }]}>{t('profile.stats.allTime')}</Text>
        </View>
        <View style={styles.heroBlock} accessible accessibilityLabel={`${t('profile.stats.totalDistance')} ${distance.value} ${distance.unit}`}>
          <Text style={[type.label, { color: 'rgba(255,255,255,0.45)' }]}>{t('profile.stats.totalDistance')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={[type.hero, { color: c.onHero }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {distance.value}
            </Text>
            <Text style={[type.unit, { fontSize: 22, color: c.accentStrong }]}>{distance.unit}</Text>
          </View>
          {stats.drives === 0 ? <Text style={[type.caption, { color: c.onHeroSecondary }]}>{t('profile.stats.emptyBody')}</Text> : null}
        </View>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE }}>
          {grid.map((row, i) => (
            <View key={i} style={[styles.gridRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE }]}>
              {row.map((cell, j) => (
                <ClusterCell key={cell.label} {...cell} last={j === row.length - 1} />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.territory}>
          <View style={[styles.territoryHex]}>
            <Icon name="hexagon" size={16} color={localOnly ? 'rgba(255,255,255,0.35)' : c.accentStrong} />
          </View>
          {localOnly ? (
            <Text style={[type.caption, { color: c.onHeroSecondary, flex: 1 }]}>{t('profile.stats.territoryLocal')}</Text>
          ) : season.data ? (
            <View style={{ flex: 1, flexDirection: 'row', alignSelf: 'stretch' }}>
              <ClusterCell label={t('metrics.cellsHeld')} value={formatInt(season.data.cellsHeld)} />
              <ClusterCell label={t('metrics.cellsEver')} value={formatInt(season.data.cellsEver)} last />
            </View>
          ) : season.error ? (
            <PressableScale onPress={() => season.reload()} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text style={[type.caption, { color: c.onHeroSecondary, flex: 1 }]}>{isOfflineError(season.error) ? t('common.offlineTitle') : t('common.errorTitle')}</Text>
              <Icon name="refresh" size={14} color={c.onHeroSecondary} />
            </PressableScale>
          ) : (
            <View style={{ flex: 1, flexDirection: 'row', gap: space.lg }}>
              <Skeleton height={34} width="40%" style={{ backgroundColor: LINE }} />
              <Skeleton height={34} width="40%" style={{ backgroundColor: LINE }} />
            </View>
          )}
        </View>
      </Animated.View>

      <Animated.View entering={enter(2)} style={{ marginBottom: space.xl }}>
        <SectionTitle title={t('profile.trophiesTitle')} action={t('common.seeAll')} onAction={() => router.push('/trophies')} />
        <Card onPress={() => router.push('/trophies')} accessibilityLabel={t('profile.trophiesTitle')}>
          {localOnly ? (
            <Text style={[type.callout, { color: c.textSecondary }]}>{t('profile.trophy.localBody')}</Text>
          ) : trophies.loading && !trophies.data ? (
            <View style={styles.trophyRow}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={styles.trophyItem}>
                  <Skeleton width={60} height={60} radius={18} />
                  <Skeleton width={50} height={10} />
                </View>
              ))}
            </View>
          ) : trophies.error && !trophies.data ? (
            <View style={styles.inlineState}>
              <Icon name={isOfflineError(trophies.error) ? 'offline' : 'warning'} size={16} color={c.textSecondary} />
              <Text style={[type.callout, { color: c.textSecondary, flex: 1 }]}>{isOfflineError(trophies.error) ? t('common.offlineTitle') : t('common.errorTitle')}</Text>
              <Text style={[type.callout, { color: c.accentStrong, fontFamily: fonts.semibold }]} onPress={() => trophies.reload()}>
                {t('common.retry')}
              </Text>
            </View>
          ) : preview.length === 0 ? (
            <View style={{ gap: 4 }}>
              <Text style={[type.bodyStrong, { color: c.text }]}>{t('profile.trophyPreview.emptyTitle')}</Text>
              <Text style={[type.callout, { color: c.textSecondary }]}>{t('profile.trophyPreview.emptyBody')}</Text>
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <View style={styles.trophyRow}>
                {preview.map((tr) => (
                  <View key={tr.id} style={styles.trophyItem}>
                    <TrophyBadge trophy={tr} size={64} />
                    <Text style={[type.caption, { color: tr.tier > 0 ? c.text : c.textTertiary, textAlign: 'center' }]} numberOfLines={1}>
                      {trophyName(tr.id)}
                    </Text>
                  </View>
                ))}
              </View>
              <Label style={{ textAlign: 'center' }}>{plural('profile.trophyPreview.earned', earnedCount)}</Label>
            </View>
          )}
        </Card>
      </Animated.View>

      <Animated.View entering={enter(3)}>
        <Group>
          <Row
            icon="people"
            iconColor={c.friend}
            iconBg={c.friendSoft}
            title={t('profile.social.friends')}
            subtitle={t('profile.social.friendsSub')}
            onPress={() => router.push('/friends')}
          />
          <Row
            icon="flag"
            iconColor={c.club}
            iconBg={c.clubSoft}
            title={me?.club?.name ?? t('profile.social.club')}
            subtitle={me?.club ? t('profile.social.club') : t('profile.social.clubNone')}
            onPress={() => router.push('/clubs')}
            last
          />
        </Group>
      </Animated.View>

      <Animated.View entering={enter(4)}>
        <Group title={t('profile.settings.units')}>
          <View style={styles.segmentWrap}>
            <Segmented
              options={[
                { value: 'metric', label: t('profile.settings.metric') },
                { value: 'imperial', label: t('profile.settings.imperial') },
              ]}
              value={units}
              onChange={(v) => useSettings.setState({ units: v })}
            />
          </View>
        </Group>

        <Group title={t('profile.settings.recording')} footer={autoDetect ? undefined : t('profile.settings.recordingFooter')}>
          <ToggleRow icon="bolt" title={t('profile.settings.autoDetect')} subtitle={t('profile.settings.autoDetectSub')} value={autoDetect} onChange={(v) => (v && (perms.location !== 'granted' || perms.motion === 'undetermined') ? requestAutoDetect() : setAutoDetect(v)).catch(() => failure())} />
          <Row
            icon="timer"
            title={t('profile.settings.stopAfter')}
            last
            right={
              <View style={styles.stepper}>
                <IconButton icon="minus" label={t('profile.settings.stopLess')} size={30} disabled={stopAfterMin <= 2} onPress={() => setStop(stopAfterMin - 1)} />
                <Text style={[type.mono, { color: c.text, minWidth: 52, textAlign: 'center' }]} accessibilityLiveRegion="polite">
                  {t('profile.settings.stopAfterValue', { n: stopAfterMin })}
                </Text>
                <IconButton icon="plus" label={t('profile.settings.stopMore')} size={30} disabled={stopAfterMin >= 10} onPress={() => setStop(stopAfterMin + 1)} />
              </View>
            }
          />
        </Group>

        <Group title={t('profile.settings.appearance')}>
          <View style={styles.segmentWrap}>
            <Segmented
              options={[
                { value: 'system', label: t('profile.settings.system') },
                { value: 'dark', label: t('profile.settings.dark') },
                { value: 'light', label: t('profile.settings.light') },
              ]}
              value={theme}
              onChange={(v) => useSettings.setState({ theme: v })}
            />
          </View>
        </Group>

        <Group title={t('profile.settings.privacy')} footer={t('profile.settings.privacyFooter')}>
          <ToggleRow icon="lock" title={t('profile.settings.localOnly')} subtitle={t('profile.settings.localOnlySub')} value={localOnly} disabled={busy === 'local'} onChange={toggleLocal} />
          <ToggleRow icon="eyeSlash" title={t('profile.settings.hide')} subtitle={t('profile.settings.hideSub')} value={privacy.hideFromLeaderboards} disabled={!online} onChange={(v) => updatePrivacy({ hideFromLeaderboards: v })} />
          <ToggleRow icon="cloud" title={t('profile.settings.backup')} subtitle={t('profile.settings.backupSub')} value={privacy.cloudBackup} disabled={!online} onChange={(v) => updatePrivacy({ cloudBackup: v })} />
          <Row icon="hand" title={t('moderation.blockedUsers')} onPress={() => router.push('/settings/blocked')} last />
        </Group>

        <Group title={t('profile.settings.account')}>
          {me ? <Row icon="pencil" title={t('profile.editTitle')} onPress={() => router.push('/settings/profile')} /> : null}
          {me ? <Row icon="key" title={t('profile.recoveryTitle')} onPress={() => router.push('/settings/recovery')} /> : null}
          <Row icon="restore" title={t('profile.settings.restore')} onPress={() => router.push('/settings/restore')} last />
        </Group>

        <Group>
          <Row icon="info" title={t('profile.settings.about')} onPress={() => router.push('/settings/about')} last />
        </Group>

        <Group>
          <Row
            icon="trash"
            title={t('profile.settings.delete')}
            destructive
            onPress={busy ? undefined : confirmDelete}
            right={busy === 'delete' ? <ActivityIndicator color={c.danger} /> : undefined}
            last
          />
        </Group>

        <Text style={[type.caption, { color: c.textTertiary, textAlign: 'center', marginTop: space.sm }]}>
          {t('profile.settings.version', { v: Application.nativeApplicationVersion ?? '1.0.0', b: Application.nativeBuildVersion ?? '1' })}
        </Text>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.xl, marginTop: space.sm },
  avatarGlow: { borderRadius: 999, shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, maxWidth: 180 },
  pillText: { fontFamily: fonts.semibold, fontSize: 11.5, lineHeight: 15 },
  carDot: { width: 9, height: 9, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth },
  cluster: { borderRadius: radius.xl, overflow: 'hidden', marginBottom: space.xl },
  decor: { position: 'absolute', top: -6, right: -10 },
  clusterTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  heroBlock: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.lg, gap: 2 },
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, paddingVertical: space.md, paddingHorizontal: space.md, gap: 4 },
  cellLabel: { fontSize: 9.5, letterSpacing: 1 },
  cellValue: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  territory: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.lg, paddingRight: space.xs, minHeight: 64, backgroundColor: 'rgba(16,185,129,0.06)' },
  territoryHex: { width: 28, alignItems: 'center' },
  trophyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  trophyItem: { flex: 1, alignItems: 'center', gap: space.sm },
  inlineState: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  segmentWrap: { padding: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
