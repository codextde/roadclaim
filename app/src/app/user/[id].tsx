import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, readableOn } from '@/components/avatar';
import { HexMark } from '@/components/hex';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { moderationMenu } from '@/components/moderation';
import { H2HHeader, H2HRow } from '@/components/ranks/h2h-bars';
import { EmptyState, errorCode, ErrorState, LocalOnlyState, Skeleton, SkeletonList } from '@/components/states';
import { Button, Card, IconButton, Notice, Pill, Screen, SectionTitle, Stat, StatGrid } from '@/components/ui';
import { formatInt, type Key, useT } from '@/i18n';
import { radius, space, tierColor, type, useColors } from '@/theme';
import { failure, impact, success } from '@/ui-lib/haptics';
import { type FriendRequest, remote, type SeasonStats, type Trophy, type UserProfile, useCompare, useConfig, useFriendRequests, useLocalOnly, useSession, useUserProfile } from '@/ui-lib/remote';
import { useFormat } from '@/ui-lib/units';

const trophyIcons: Record<string, IconName> = {
  first_drive: 'flagCheckered',
  distance_total: 'road',
  distance_single: 'route',
  active_days: 'calendar',
  streak: 'bolt',
  cells_held: 'hexagon',
  steals: 'swords',
  night_drive: 'moon',
  early_bird: 'sunrise',
  climber: 'mountain',
  countries: 'globeEurope',
  club_join: 'shield',
};

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { t } = useT();
  const localOnly = useLocalOnly();
  const { me } = useSession();
  const profile = useUserProfile(id);
  const isMe = me?.id === id;
  const data: UserProfile | undefined = profile.data;

  const header = (
    <Stack.Screen
      options={{
        title: '',
        headerRight:
          data && !isMe && !localOnly
            ? () => (
                <IconButton
                  icon="more"
                  label={t('moderation.menu')}
                  size={34}
                  bg="transparent"
                  onPress={() =>
                    moderationMenu({
                      kind: 'user',
                      id,
                      name: data.user.displayName,
                      blocked: data.isBlocked,
                      onBlockChange: () => {
                        if (data.isBlocked) profile.reload();
                        else router.back();
                      },
                    })
                  }
                />
              )
            : undefined,
      }}
    />
  );

  if (localOnly) {
    return (
      <Screen>
        {header}
        <LocalOnlyState />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        {header}
        {profile.error ? (
          errorCode(profile.error) === 'not_found' || (profile.error as { status?: number }).status === 404 ? (
            <EmptyState icon="person" title={t('ranks.notFoundTitle')} body={t('ranks.notFoundBody')} />
          ) : (
            <ErrorState error={profile.error} onRetry={profile.reload} />
          )
        ) : (
          <ProfileSkeleton />
        )}
      </Screen>
    );
  }

  const { user } = data;
  return (
    <Screen>
      {header}
      <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.hero}>
        <View style={[styles.halo, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Avatar name={user.displayName} color={user.avatarColor} size={104} />
        </View>
        <Text style={[type.title, { color: c.text, textAlign: 'center' }]} numberOfLines={2} accessibilityRole="header">
          {user.displayName}
        </Text>
        <Text style={[type.callout, { color: c.textSecondary }]}>@{user.username}</Text>
        {user.homeCity ? (
          <View style={styles.city}>
            <Icon name="pin" size={13} color={c.textTertiary} />
            <Text style={[type.caption, { color: c.textSecondary }]}>{[user.homeCity, user.homeCountry].filter(Boolean).join(', ')}</Text>
          </View>
        ) : null}
        {user.club || user.car ? (
          <View style={styles.pills}>
            {user.club ? <Pill text={user.club.name} icon="shield" color={c.club} bg={c.clubSoft} /> : null}
            {user.car ? <Pill text={user.car.label} icon="car" color={c.textSecondary} bg={c.surfaceRaised} /> : null}
          </View>
        ) : null}
        {!isMe ? <FriendAction profile={data} onChanged={profile.reload} /> : null}
      </Animated.View>

      {data.isBlocked ? <Notice tone="danger" icon="hand" title={t('moderation.blocked')} style={{ marginBottom: space.xl }} /> : null}

      <Animated.View entering={FadeInDown.springify().damping(18).delay(60)}>
        <SeasonStatsGrid stats={data.stats} />
      </Animated.View>

      <Animated.View entering={FadeInDown.springify().damping(18).delay(110)} style={{ marginTop: space.xl }}>
        <TrophyRow trophies={data.trophies} />
      </Animated.View>

      {!isMe && !data.isBlocked ? (
        <Animated.View entering={FadeInDown.springify().damping(18).delay(160)} style={{ marginTop: space.xl }}>
          <HeadToHead id={id} name={user.displayName} />
        </Animated.View>
      ) : null}
    </Screen>
  );
}

function FriendAction({ profile, onChanged }: { profile: UserProfile; onChanged: () => void }) {
  const { t } = useT();
  const requests = useFriendRequests();
  const [busy, setBusy] = useState(false);
  const { user } = profile;

  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    action()
      .then(() => {
        success();
        onChanged();
      })
      .catch(() => {
        failure();
        Alert.alert(t('common.errorTitle'), t('ranks.actionFailed'));
      })
      .finally(() => setBusy(false));
  };

  if (profile.isFriend) {
    return (
      <Button
        title={t('ranks.friends')}
        icon="checkCircle"
        variant="secondary"
        compact
        loading={busy}
        style={styles.action}
        onPress={() =>
          Alert.alert(user.displayName, undefined, [
            {
              text: t('ranks.removeFriend'),
              style: 'destructive',
              onPress: () =>
                Alert.alert(t('ranks.removeFriendTitle', { name: user.displayName }), t('ranks.removeFriendBody'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('common.remove'), style: 'destructive', onPress: () => run(() => remote.removeFriend(user.id)) },
                ]),
            },
            { text: t('common.cancel'), style: 'cancel' },
          ])
        }
      />
    );
  }
  if (profile.requestPending === 'out') {
    return <Button title={t('ranks.requested')} icon="clock" variant="secondary" compact disabled style={styles.action} onPress={() => undefined} />;
  }
  if (profile.requestPending === 'in') {
    const request = requests.data?.incoming.find((r: FriendRequest) => r.user.id === user.id);
    return (
      <Button
        title={t('ranks.acceptRequest')}
        icon="personAdd"
        variant="friend"
        compact
        loading={busy || (!request && requests.loading)}
        disabled={!request}
        style={styles.action}
        onPress={() => {
          if (!request) return;
          impact('medium');
          run(() => remote.acceptRequest(request.id));
        }}
      />
    );
  }
  return (
    <Button
      title={t('ranks.addFriend')}
      icon="personAdd"
      compact
      loading={busy}
      style={styles.action}
      onPress={() => {
        impact('medium');
        run(() => remote.requestFriend(user.id));
      }}
    />
  );
}

function SeasonStatsGrid({ stats }: { stats: SeasonStats }) {
  const { t } = useT();
  const f = useFormat();
  const config = useConfig();
  const year = config.data?.season ?? String(new Date().getFullYear());
  const dist = f.distanceParts(stats.distanceM);
  const longest = f.distanceParts(stats.longestM);
  const climb = f.elevationParts(stats.elevationGainM);
  return (
    <>
      <SectionTitle title={t('common.season', { year })} />
      <StatGrid>
        <Stat label={t('metrics.distance')} value={dist.value} unit={dist.unit} icon="road" />
        <Stat label={t('metrics.drives')} value={formatInt(stats.drives)} icon="car" />
        <Stat label={t('metrics.longest')} value={longest.value} unit={longest.unit} icon="route" />
        <Stat label={t('metrics.cellsHeld')} value={formatInt(stats.cellsHeld)} icon="hexagon" />
        <Stat label={t('metrics.activeDays')} value={formatInt(stats.activeDays)} icon="calendar" />
        <Stat label={t('metrics.elevationGain')} value={climb.value} unit={climb.unit} icon="mountain" />
      </StatGrid>
    </>
  );
}

function TrophyRow({ trophies }: { trophies: Trophy[] }) {
  const c = useColors();
  const { t } = useT();
  const earned = trophies.filter((x) => x.tier > 0).sort((a, b) => b.tier - a.tier);
  return (
    <>
      <SectionTitle title={`${t('ranks.trophies')}  ${earned.length}`} />
      {earned.length === 0 ? (
        <View style={[styles.noTrophies, { backgroundColor: c.surface, borderColor: c.border }]}>
          <HexMark size={34} color={c.textTertiary} icon="trophy" />
          <Text style={[type.callout, { color: c.textSecondary }]}>{t('ranks.noTrophies')}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
          {earned.map((tr) => {
            const name = t(`profile.items.${tr.id}.name` as Key);
            const tierName = t(`profile.trophy.tier${tr.tier}` as Key);
            return (
              <View key={tr.id} style={styles.trophy} accessible accessibilityLabel={`${name}, ${tierName}`}>
                <HexMark size={56} color={tierColor(c, tr.tier)} icon={trophyIcons[tr.id] ?? 'trophy'} filled iconColor={readableOn(tierColor(c, tr.tier))} />
                <Text style={[type.caption, { color: c.text, textAlign: 'center' }]} numberOfLines={2}>
                  {name.startsWith('profile.') ? tierName : name}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

function HeadToHead({ id, name }: { id: string; name: string }) {
  const c = useColors();
  const { t } = useT();
  const f = useFormat();
  const { me } = useSession();
  const compare = useCompare(id);

  let body;
  if (!compare.data && compare.error) body = <ErrorState error={compare.error} onRetry={compare.reload} />;
  else if (!compare.data)
    body = (
      <View style={{ gap: space.lg }}>
        <Skeleton height={64} radius={radius.md} />
        <SkeletonList rows={4} height={30} />
      </View>
    );
  else {
    const { me: mine, them, user } = compare.data as { me: SeasonStats; them: SeasonStats; user: UserProfile['user'] };
    const rows: { label: string; a: number; b: number; fmt: (v: number) => string }[] = [
      { label: t('metrics.distance'), a: mine.distanceM, b: them.distanceM, fmt: f.distance },
      { label: t('metrics.drives'), a: mine.drives, b: them.drives, fmt: formatInt },
      { label: t('metrics.longest'), a: mine.longestM, b: them.longestM, fmt: f.distance },
      { label: t('metrics.cellsHeld'), a: mine.cellsHeld, b: them.cellsHeld, fmt: formatInt },
      { label: t('metrics.trophies'), a: mine.trophies, b: them.trophies, fmt: formatInt },
      { label: t('metrics.activeDays'), a: mine.activeDays, b: them.activeDays, fmt: formatInt },
      { label: t('metrics.elevationGain'), a: mine.elevationGainM, b: them.elevationGainM, fmt: f.elevation },
    ];
    const wins = rows.filter((r) => r.a > r.b).length;
    const losses = rows.filter((r) => r.b > r.a).length;
    body = (
      <View style={{ gap: space.xl }}>
        <H2HHeader me={{ name: me?.displayName ?? t('common.you'), color: me?.avatarColor ?? c.accent }} them={user} mine={wins} theirs={losses} />
        <View style={{ gap: space.lg }}>
          {rows.map((r, i) => (
            <H2HRow key={r.label} label={r.label} mine={r.a} theirs={r.b} mineText={r.fmt(r.a)} theirsText={r.fmt(r.b)} name={user.displayName} index={i} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <>
      <SectionTitle title={t('ranks.h2hTitle')} />
      <Card accessibilityLabel={`${t('ranks.h2hTitle')} ${name}`}>{body}</Card>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.lg }}>
      <Skeleton width={112} height={112} radius={56} />
      <Skeleton width="50%" height={26} />
      <Skeleton width="30%" height={14} />
      <View style={{ alignSelf: 'stretch', marginTop: space.xl }}>
        <SkeletonList rows={3} height={76} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.xs, paddingTop: space.md, marginBottom: space.xl },
  halo: { padding: 6, borderRadius: 60, borderWidth: StyleSheet.hairlineWidth, marginBottom: space.md },
  city: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.sm },
  action: { marginTop: space.lg, minWidth: 180 },
  noTrophies: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  trophy: { width: 76, alignItems: 'center', gap: space.sm },
});
