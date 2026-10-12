import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { hexPath } from '@/components/hex';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { showError } from '@/components/social/action-menu';
import { ClubHex } from '@/components/social/club-hex';
import { ClubView } from '@/components/social/club-view';
import { useDebounced, useRefreshOnFocus } from '@/components/social/hooks';
import { EmptyState, ErrorState, LocalOnlyState, Skeleton, SkeletonList } from '@/components/states';
import { Button, Group, Screen, SearchField } from '@/components/ui';
import { formatInt, useT } from '@/i18n';
import { radius, space, type, useColors, withAlpha } from '@/theme';
import { success } from '@/ui-lib/haptics';
import { remote, useClubSearch, useLocalOnly, useMyClub, type Club } from '@/ui-lib/remote';

export default function ClubsScreen() {
  const localOnly = useLocalOnly();
  const mine = useMyClub();
  useRefreshOnFocus(mine.reload);

  if (localOnly) {
    return (
      <Screen>
        <LocalOnlyState />
      </Screen>
    );
  }
  if (mine.data?.club) return <ClubView id={mine.data.club.id} onGone={mine.reload} />;
  if (!mine.data) {
    return (
      <Screen>
        {mine.loading ? (
          <View style={{ gap: space.md }}>
            <Skeleton height={260} radius={radius.lg} />
            <SkeletonList rows={3} />
          </View>
        ) : (
          <ErrorState error={mine.error} onRetry={mine.reload} />
        )}
      </Screen>
    );
  }
  return <ClubIntro onJoined={mine.reload} />;
}

function Honeycomb({ color }: { color: string }) {
  const size = 34;
  const w = size * 0.88;
  const cells = [
    [0, 0, 0.9],
    [1, 0, 0.55],
    [-1, 0, 0.3],
    [0.5, -0.76, 0.4],
    [-0.5, -0.76, 0.7],
    [0.5, 0.76, 0.22],
    [-0.5, 0.76, 0.45],
    [1.5, -0.76, 0.14],
    [-1.5, 0.76, 0.12],
  ];
  const W = size * 4;
  const H = size * 2.6;
  return (
    <Svg width={W} height={H}>
      {cells.map(([x, y, o], i) => (
        <Path key={i} d={hexPath(size, 1.5)} transform={`translate(${W / 2 - size / 2 + x * w} ${H / 2 - size / 2 + y * size})`} fill={withAlpha(color, o)} />
      ))}
    </Svg>
  );
}

function ClubIntro({ onJoined }: { onJoined: () => void }) {
  const c = useColors();
  const { t } = useT();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const search = useClubSearch(query);
  const [joining, setJoining] = useState<string | null>(null);

  const join = async (club: Club) => {
    setJoining(club.id);
    try {
      await remote.joinClub(club.id);
      success();
      onJoined();
    } catch (e) {
      showError(e);
    } finally {
      setJoining(null);
    }
  };

  const perks: { icon: IconName; title: string; body: string }[] = [
    { icon: 'hexagon', title: t('social.perkTurf'), body: t('social.perkTurfBody') },
    { icon: 'ranks', title: t('social.perkBoard'), body: t('social.perkBoardBody') },
    { icon: 'key', title: t('social.perkCode'), body: t('social.perkCodeBody') },
  ];
  const items = search.data?.items ?? [];

  return (
    <Screen>
      <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.hero, { backgroundColor: c.surface, borderColor: withAlpha(c.club, 0.3) }]}>
        <View style={[styles.heroGlow, { backgroundColor: c.clubSoft }]} />
        <Honeycomb color={c.club} />
        <Text style={[type.title, { color: c.text, textAlign: 'center' }]} accessibilityRole="header">
          {t('social.clubIntroTitle')}
        </Text>
        <Text style={[type.callout, { color: c.textSecondary, textAlign: 'center', maxWidth: 320 }]}>{t('social.clubIntroBody')}</Text>
        <View style={styles.perks}>
          {perks.map((p) => (
            <View key={p.icon} style={styles.perk}>
              <View style={[styles.perkIcon, { backgroundColor: c.clubSoft }]}>
                <Icon name={p.icon} size={15} color={c.club} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={[type.bodyStrong, { color: c.text }]}>{p.title}</Text>
                <Text style={[type.caption, { color: c.textSecondary }]}>{p.body}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.actions}>
          <Button title={t('social.createClub')} icon="plus" variant="club" large onPress={() => router.push('/clubs/create')} />
          <Button title={t('social.joinWithCode')} icon="key" variant="secondary" onPress={() => router.push('/clubs/join')} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).springify().damping(18)} style={{ marginTop: space.xxl, gap: space.md }}>
        <Text style={[type.headline, { color: c.text, marginHorizontal: space.xs }]}>{t('social.publicClubs')}</Text>
        <SearchField value={q} onChangeText={setQ} placeholder={t('social.searchClubs')} />
        {search.loading && !search.data ? (
          <SkeletonList rows={4} height={64} />
        ) : search.error && !search.data ? (
          <ErrorState error={search.error} onRetry={search.reload} />
        ) : items.length === 0 ? (
          <EmptyState icon="flag" tint={c.club} title={query ? t('social.noClubsFound') : t('social.noClubsYet')} body={query ? t('social.noClubsFoundBody', { q: query }) : t('social.noClubsYetBody')} />
        ) : (
          <Group>
            {items.map((club, i) => (
              <Pressable
                key={club.id}
                onPress={() => router.push(`/clubs/${club.id}`)}
                accessibilityRole="button"
                accessibilityLabel={club.name}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfacePressed }]}>
                <ClubHex name={club.name} color={club.color} size={40} />
                <View style={[styles.rowBody, i < items.length - 1 && { borderBottomColor: c.borderStrong, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
                      {club.name}
                    </Text>
                    <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={1}>
                      {t('social.clubMeta', { members: formatInt(club.memberCount), cells: formatInt(club.cellsHeld) })}
                    </Text>
                  </View>
                  <Button title={t('social.join')} variant="club" compact loading={joining === club.id} onPress={() => join(club)} />
                </View>
              </Pressable>
            ))}
          </Group>
        )}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, borderWidth: 1, padding: space.xl, alignItems: 'center', gap: space.md, overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: -140, width: 360, height: 260, borderRadius: 180, alignSelf: 'center' },
  perks: { alignSelf: 'stretch', gap: space.md, marginTop: space.sm },
  perk: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  perkIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: space.sm, alignSelf: 'stretch', marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, gap: space.md },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingRight: space.md, minHeight: 64 },
});
