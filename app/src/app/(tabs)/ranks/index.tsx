import { router, useFocusEffect } from 'expo-router';
import { type ComponentProps, type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { HexMark } from '@/components/hex';
import { Icon } from '@/components/icon';
import { BoardList, BoardRow, PinnedMeBar, UserBoardRow } from '@/components/ranks/board-row';
import { useBoardFormat } from '@/components/ranks/format';
import { Podium } from '@/components/ranks/podium';
import { EmptyState, ErrorState, LocalOnlyState, OfflineBanner, Skeleton, SkeletonList } from '@/components/states';
import { Card, ChipRow, Label, Pill, Screen, Segmented } from '@/components/ui';
import { useT } from '@/i18n';
import { radius, space, type, useColors } from '@/theme';
import { monthKey, monthLabel } from '@/ui-lib/date';
import {
  type BoardEntry,
  type Club,
  type Metric,
  type Period,
  type Scope,
  useClubBoard,
  useConfig,
  useFriends,
  useLeaderboard,
  useLocalOnly,
  useSession,
} from '@/ui-lib/remote';

type Board = 'drivers' | 'clubs';
type ClubEntry = { rank: number; club: Club; value: number };

export default function RanksScreen() {
  const c = useColors();
  const { t } = useT();
  const localOnly = useLocalOnly();
  const { me, offline } = useSession();
  const config = useConfig();
  const [board, setBoard] = useState<Board>('drivers');
  const [metric, setMetric] = useState<Metric>('distance');
  const [clubMetric, setClubMetric] = useState<'area' | 'distance'>('area');
  const [scope, setScope] = useState<Scope>('friends');
  const [period, setPeriod] = useState<Period>('week');
  const [refreshing, setRefreshing] = useState(false);

  const clubId = me?.club?.id;
  const activeScope: Scope = scope === 'club' && !clubId ? 'friends' : scope;
  const year = config.data?.season ?? String(new Date().getFullYear());

  const drivers = useLeaderboard({ metric, scope: activeScope, period, clubId: activeScope === 'club' ? clubId : undefined });
  const clubs = useClubBoard({ metric: clubMetric, period });
  const friends = useFriends();
  const active = board === 'drivers' ? drivers : clubs;

  const reloadRef = useRef(active.reload);
  const focusedOnce = useRef(false);
  useEffect(() => {
    reloadRef.current = active.reload;
  });
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reloadRef.current();
      focusedOnce.current = true;
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    Promise.resolve(active.reload()).finally(() => setRefreshing(false));
  };

  const periodOptions: { value: Period; label: string }[] = [
    { value: 'today', label: t('ranks.periodToday') },
    { value: 'week', label: t('ranks.periodWeek') },
    { value: 'month', label: t('ranks.periodMonth') },
    { value: 'season', label: t('common.season', { year }) },
  ];

  if (localOnly) {
    return (
      <Screen>
        <LocalOnlyState />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <DriversOrClubs
        board={board}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} />}
        header={
          <>
            {offline ? <OfflineBanner style={{ marginBottom: space.md }} /> : null}
            <SeasonCard />
            <Segmented
              style={{ marginTop: space.xl }}
              value={board}
              onChange={setBoard}
              options={[
                { value: 'drivers', label: t('ranks.boardDrivers') },
                { value: 'clubs', label: t('ranks.boardClubs') },
              ]}
            />
            {board === 'drivers' ? (
              <>
                <Segmented
                  style={{ marginTop: space.md }}
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { value: 'distance', label: t('ranks.metricDistance') },
                    { value: 'area', label: t('ranks.metricArea') },
                    { value: 'longest', label: t('ranks.metricLongest') },
                    { value: 'trophies', label: t('ranks.metricTrophies') },
                  ]}
                />
                <ChipRow
                  style={styles.chips}
                  value={activeScope}
                  onChange={setScope}
                  options={[
                    { value: 'friends', label: t('ranks.scopeFriends'), icon: 'people' },
                    { value: 'city', label: t('ranks.scopeCity'), icon: 'city' },
                    { value: 'country', label: t('ranks.scopeCountry'), icon: 'flag' },
                    { value: 'world', label: t('ranks.scopeWorld'), icon: 'globeEurope' },
                    ...(clubId ? [{ value: 'club' as const, label: t('ranks.scopeClub'), icon: 'shield' as const }] : []),
                  ]}
                />
              </>
            ) : (
              <Segmented
                style={{ marginTop: space.md }}
                value={clubMetric}
                onChange={setClubMetric}
                options={[
                  { value: 'area', label: t('ranks.metricArea') },
                  { value: 'distance', label: t('ranks.metricDistance') },
                ]}
              />
            )}
            <ChipRow style={styles.chipsTight} value={period} onChange={setPeriod} options={periodOptions} color={board === 'clubs' ? c.club : undefined} />
          </>
        }
        drivers={drivers}
        clubs={clubs}
        metric={metric}
        clubMetric={clubMetric}
        meId={me?.id}
        myClubId={clubId}
        periodLabel={periodOptions.find((p) => p.value === period)?.label ?? ''}
        dataKey={board === 'drivers' ? `${metric}/${activeScope}/${period}` : `clubs/${clubMetric}/${period}`}
        noFriends={activeScope === 'friends' && friends.data?.items.length === 0}
      />
    </View>
  );
}

function DriversOrClubs({
  board,
  header,
  refreshControl,
  drivers,
  clubs,
  metric,
  clubMetric,
  meId,
  myClubId,
  periodLabel,
  noFriends,
  dataKey,
}: {
  board: Board;
  header: ReactNode;
  refreshControl: ReactElement<ComponentProps<typeof RefreshControl>>;
  drivers: ReturnType<typeof useLeaderboard>;
  clubs: ReturnType<typeof useClubBoard>;
  metric: Metric;
  clubMetric: 'area' | 'distance';
  meId?: string;
  myClubId?: string;
  periodLabel: string;
  noFriends: boolean;
  dataKey: string;
}) {
  const c = useColors();
  const { t, plural } = useT();
  const format = useBoardFormat();
  const [meVisible, setMeVisible] = useState(true);
  const anchor = useRef<{ y: number; h: number } | null>(null);
  const listY = useRef(0);
  const viewport = useRef({ y: 0, h: 0 });

  const check = () => {
    const a = anchor.current;
    if (!a) return;
    const { y, h } = viewport.current;
    const visible = a.y + a.h > y + 80 && a.y < y + h - 150;
    setMeVisible((v) => (v === visible ? v : visible));
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    viewport.current = { y: e.nativeEvent.contentOffset.y, h: e.nativeEvent.layoutMeasurement.height };
    check();
  };

  const openUser = (entry: BoardEntry) => {
    if (entry.user.id === meId) router.push('/profile');
    else router.push(`/user/${entry.user.id}`);
  };

  let body: ReactNode;
  let pinned: ReactNode = null;

  if (board === 'drivers') {
    const data: { entries: BoardEntry[]; me: BoardEntry | null; scopeLabel: string } | undefined = drivers.data;
    const fmt = (v: number) => format(metric, v);
    if (!data && drivers.error) {
      body = <ErrorState error={drivers.error} onRetry={drivers.reload} />;
    } else if (!data) {
      body = <BoardSkeleton />;
    } else if (data.entries.length === 0) {
      body = noFriends ? (
        <EmptyState icon="personAdd" tint={c.friend} title={t('ranks.noFriendsTitle')} body={t('ranks.noFriendsBody')} action={t('ranks.addFriends')} onAction={() => router.push('/friends/add')} />
      ) : (
        <EmptyState icon="ranks" title={t('ranks.emptyTitle')} body={t('ranks.emptyBody')} />
      );
    } else {
      const top = data.entries.slice(0, 3);
      const rest = data.entries.slice(3);
      const mine = data.me ?? data.entries.find((e) => e.user.id === meId) ?? null;
      const inList = !!meId && data.entries.some((e) => e.user.id === meId);
      const meInPodium = !!meId && top.some((e) => e.user.id === meId);
      body = (
        <>
          <View style={styles.scopeRow}>
            <Label>{[data.scopeLabel, periodLabel].filter(Boolean).join('  ·  ')}</Label>
          </View>
          <View
            onLayout={(e: LayoutChangeEvent) => {
              if (meInPodium) {
                anchor.current = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
                check();
              }
            }}>
            <Podium entries={top} format={fmt} meId={meId} onPress={openUser} />
          </View>
          {rest.length > 0 ? (
            <View onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
              <BoardList>
                {rest.map((entry, i) => {
                  const isMe = entry.user.id === meId;
                  const row = <UserBoardRow entry={entry} value={fmt(entry.value)} isMe={isMe} onPress={() => openUser(entry)} index={i} last={i === rest.length - 1} />;
                  return isMe ? (
                    <View
                      key={entry.user.id}
                      onLayout={(e) => {
                        anchor.current = { y: listY.current + e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
                        check();
                      }}>
                      {row}
                    </View>
                  ) : (
                    <View key={entry.user.id}>{row}</View>
                  );
                })}
              </BoardList>
            </View>
          ) : null}
        </>
      );
      if (!inList || !meVisible) {
        pinned = <PinnedMeBar entry={mine} value={mine ? fmt(mine.value) : null} onPress={mine ? () => router.push('/profile') : undefined} />;
      }
    }
  } else {
    const data: { entries: ClubEntry[] } | undefined = clubs.data;
    if (!data && clubs.error) {
      body = <ErrorState error={clubs.error} onRetry={clubs.reload} />;
    } else if (!data) {
      body = <SkeletonList rows={6} height={64} />;
    } else if (data.entries.length === 0) {
      body = <EmptyState icon="shield" tint={c.club} title={t('ranks.clubsEmptyTitle')} body={t('ranks.clubsEmptyBody')} action={t('ranks.startClub')} onAction={() => router.push('/clubs/create')} />;
    } else {
      body = (
        <>
          <View style={styles.scopeRow}>
            <Label>{[t('ranks.clubsTitle'), periodLabel].join('  ·  ')}</Label>
          </View>
          <BoardList>
            {data.entries.map((e, i) => {
              const mine = e.club.id === myClubId;
              return (
                <BoardRow
                  key={e.club.id}
                  rank={e.rank}
                  title={e.club.name}
                  subtitle={plural('ranks.members', e.club.memberCount)}
                  leading={<HexMark size={38} color={e.club.color} icon="shield" filled iconColor="#FFFFFF" />}
                  value={format(clubMetric === 'area' ? 'area' : 'distance', e.value)}
                  valueColor={e.rank <= 3 ? c.club : undefined}
                  highlight={mine ? c.club : undefined}
                  onPress={() => router.push(`/clubs/${e.club.id}`)}
                  index={i}
                  last={i === data.entries.length - 1}
                />
              );
            })}
          </BoardList>
        </>
      );
    }
  }

  return (
    <>
      <Screen bottomInset={pinned ? (Platform.OS === 'ios' ? 196 : 176) : undefined} refreshControl={refreshControl} onScroll={onScroll} scrollEventThrottle={48} onLayout={(e) => (viewport.current = { ...viewport.current, h: e.nativeEvent.layout.height })}>
        {header}
        <Animated.View key={dataKey} entering={FadeIn.duration(220)} style={{ marginTop: space.lg }}>
          {body}
        </Animated.View>
      </Screen>
      {pinned}
    </>
  );
}

function SeasonCard() {
  const c = useColors();
  const { t } = useT();
  return (
    <Card onPress={() => router.push('/season')} accessibilityLabel={t('ranks.seasonCardA11y')} style={styles.season}>
      <HexMark size={46} color={c.accent} icon="swords" />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={[type.bodyStrong, { color: c.text, flexShrink: 1 }]} numberOfLines={1}>
            {t('ranks.seasonTitle')}
          </Text>
          <Pill text={monthLabel(monthKey())} color={c.accentStrong} bg={c.accentSoft} />
        </View>
        <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={2}>
          {t('ranks.seasonCardBody')}
        </Text>
      </View>
      <Icon name="chevronRight" size={13} color={c.textTertiary} />
    </Card>
  );
}

function BoardSkeleton() {
  return (
    <View style={{ gap: space.lg }}>
      <Skeleton width="40%" height={12} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
        {[150, 190, 130].map((h) => (
          <View key={h} style={{ flex: 1 }}>
            <Skeleton height={h} radius={radius.md} />
          </View>
        ))}
      </View>
      <SkeletonList rows={5} height={64} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { marginTop: space.md, marginHorizontal: -space.lg },
  chipsTight: { marginTop: space.sm, marginHorizontal: -space.lg },
  scopeRow: { marginBottom: space.md, paddingHorizontal: space.xs },
  season: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});
