import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HexMark } from '@/components/hex';
import { BoardList, PinnedMeBar, UserBoardRow } from '@/components/ranks/board-row';
import { useBoardFormat } from '@/components/ranks/format';
import { EmptyState, ErrorState, LocalOnlyState, OfflineBanner, SkeletonList } from '@/components/states';
import { ChipRow, IconButton, Label, Pill, Screen, Segmented } from '@/components/ui';
import { useT } from '@/i18n';
import { radius, space, type, useColors } from '@/theme';
import { monthKey, monthLabel } from '@/ui-lib/date';
import { type BoardEntry, type SeasonBoard, useLocalOnly, useSeasonBoard, useSession } from '@/ui-lib/remote';

function shiftMonth(key: string, by: number) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
}

export default function SeasonScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const localOnly = useLocalOnly();
  const { me, offline } = useSession();
  const current = monthKey();
  const [month, setMonth] = useState(current);
  const [board, setBoard] = useState<SeasonBoard>('overall');
  const [scope, setScope] = useState<'world' | 'friends'>('world');
  const [refreshing, setRefreshing] = useState(false);
  const season = useSeasonBoard({ board, month, scope });
  const format = useBoardFormat();
  const isCurrent = month === current;
  const losers = board === 'losers';

  if (localOnly) {
    return (
      <Screen>
        <LocalOnlyState />
      </Screen>
    );
  }

  const hint = {
    overall: t('ranks.hintOverall'),
    stealers: t('ranks.hintStealers'),
    gainers: t('ranks.hintGainers'),
    losers: t('ranks.hintLosers'),
  }[board];
  const fmt = (v: number) => format('hexes', v, losers ? '-' : board === 'gainers' ? '+' : undefined);
  const valueColor = losers ? c.danger : undefined;
  const openUser = (e: BoardEntry) => (e.user.id === me?.id ? router.push('/profile') : router.push(`/user/${e.user.id}`));

  const data = season.data;
  const entries = data?.entries ?? [];
  const mine = data?.me ?? entries.find((e: BoardEntry) => e.user.id === me?.id) ?? null;
  const inList = !!me && entries.some((e: BoardEntry) => e.user.id === me.id);

  let body;
  if (!data && season.error) body = <ErrorState error={season.error} onRetry={season.reload} />;
  else if (!data) body = <SkeletonList rows={7} height={64} />;
  else if (entries.length === 0) body = <EmptyState icon="hexagonOutline" title={t('ranks.seasonEmptyTitle')} body={t('ranks.seasonEmptyBody')} />;
  else
    body = (
      <BoardList>
        {entries.map((e: BoardEntry, i: number) => (
          <UserBoardRow
            key={e.user.id}
            entry={e}
            value={fmt(e.value)}
            valueColor={valueColor ?? (e.rank <= 3 ? c.accentStrong : undefined)}
            isMe={e.user.id === me?.id}
            onPress={() => openUser(e)}
            index={i}
            last={i === entries.length - 1}
          />
        ))}
      </BoardList>
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Screen
        bottomInset={insets.bottom + 120}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              Promise.resolve(season.reload()).finally(() => setRefreshing(false));
            }}
            tintColor={c.accent}
            colors={[c.accent]}
          />
        }>
        {offline ? <OfflineBanner style={{ marginBottom: space.md }} /> : null}
        <View style={[styles.month, { backgroundColor: c.surface, borderColor: c.border }]}>
          <IconButton icon="chevronLeft" label={t('ranks.prevMonth')} onPress={() => setMonth((m) => shiftMonth(m, -1))} size={38} />
          <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={[type.headline, { color: c.text }]} accessibilityRole="header" accessibilityLiveRegion="polite">
              {monthLabel(month)}
            </Text>
            {isCurrent ? <Pill text={t('ranks.currentSeason')} color={c.accentStrong} bg={c.accentSoft} icon="bolt" style={{ alignSelf: 'center' }} /> : null}
          </View>
          <IconButton icon="chevronRight" label={t('ranks.nextMonth')} onPress={() => setMonth((m) => shiftMonth(m, 1))} size={38} disabled={isCurrent} />
        </View>
        <Segmented
          style={{ marginTop: space.lg }}
          value={board}
          onChange={setBoard}
          options={[
            { value: 'overall', label: t('ranks.boardOverall') },
            { value: 'stealers', label: t('ranks.boardStealers') },
            { value: 'gainers', label: t('ranks.boardGainers') },
            { value: 'losers', label: t('ranks.boardLosers') },
          ]}
        />
        <ChipRow
          style={styles.chips}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'world', label: t('ranks.scopeWorld'), icon: 'globeEurope' },
            { value: 'friends', label: t('ranks.scopeFriends'), icon: 'people' },
          ]}
        />
        <Label style={styles.hint}>{hint}</Label>
        <Animated.View key={`${board}/${scope}/${month}`} entering={FadeIn.duration(220)}>
          {body}
        </Animated.View>
        <View style={[styles.rules, { backgroundColor: c.surfaceSunken }]}>
          <HexMark size={34} color={c.textSecondary} icon="info" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[type.callout, { color: c.text }]}>{t('ranks.rulesTitle')}</Text>
            <Text style={[type.caption, { color: c.textSecondary }]}>{t('ranks.rulesBody')}</Text>
          </View>
        </View>
      </Screen>
      {data && entries.length > 0 && !inList ? (
        <PinnedMeBar entry={mine} value={mine ? fmt(mine.value) : null} valueColor={valueColor} bottom={insets.bottom + space.md} onPress={mine ? () => router.push('/profile') : undefined} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  month: { flexDirection: 'row', alignItems: 'center', padding: space.sm, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  chips: { marginTop: space.md, marginHorizontal: -space.lg },
  hint: { marginTop: space.lg, marginBottom: space.md, paddingHorizontal: space.xs },
  rules: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, marginTop: space.xl, alignItems: 'flex-start' },
});
