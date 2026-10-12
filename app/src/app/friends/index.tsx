import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { confirmBlock } from '@/components/moderation';
import { actionMenu, confirm, showError } from '@/components/social/action-menu';
import { useRefreshOnFocus } from '@/components/social/hooks';
import { InviteCard, shareText } from '@/components/social/invite-card';
import { PersonRow } from '@/components/social/person-row';
import { EmptyState, ErrorState, LocalOnlyState, OfflineBanner, Skeleton, SkeletonList } from '@/components/states';
import { Button, Group, IconButton, Pill, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { radius, space, useColors } from '@/theme';
import { impact, success } from '@/ui-lib/haptics';
import { INVITE_BASE, remote, useFriendRequests, useFriends, useLocalOnly, useSession, type FriendRequest, type PublicUser } from '@/ui-lib/remote';

export default function FriendsScreen() {
  const c = useColors();
  const { t, plural } = useT();
  const localOnly = useLocalOnly();
  const { me, offline } = useSession();
  const friends = useFriends();
  const requests = useFriendRequests();
  const [hiddenRequests, setHiddenRequests] = useState<string[]>([]);
  const [hiddenFriends, setHiddenFriends] = useState<string[]>([]);

  useRefreshOnFocus(() => {
    friends.reload();
    requests.reload();
  });

  const header = <Stack.Screen options={{ headerRight: () => <IconButton icon="personAdd" label={t('social.addFriends')} onPress={() => router.push('/friends/add')} tint={c.friend} bg="transparent" size={34} /> }} />;

  if (localOnly) {
    return (
      <Screen>
        <LocalOnlyState title={t('social.localOnlyTitle')} body={t('social.localOnlyFriends')} />
      </Screen>
    );
  }

  const answer = async (req: FriendRequest, accept: boolean) => {
    setHiddenRequests((h) => [...h, req.id]);
    try {
      if (accept) {
        await remote.acceptRequest(req.id);
        success();
        friends.reload();
      } else {
        await remote.declineRequest(req.id);
        impact('light');
      }
      requests.reload();
    } catch (e) {
      setHiddenRequests((h) => h.filter((x) => x !== req.id));
      showError(e);
    }
  };

  const remove = (user: PublicUser) => {
    confirm(t('social.removeFriendTitle', { name: user.displayName }), t('social.removeFriendBody'), t('common.remove'), async () => {
      setHiddenFriends((h) => [...h, user.id]);
      try {
        await remote.removeFriend(user.id);
        impact('medium');
        friends.reload();
      } catch (e) {
        setHiddenFriends((h) => h.filter((x) => x !== user.id));
        showError(e);
      }
    });
  };

  const menu = (user: PublicUser) => {
    impact('light');
    actionMenu(user.displayName, [
      { text: t('social.viewProfile'), onPress: () => router.push(`/user/${user.id}`) },
      { text: t('social.removeFriend'), destructive: true, onPress: () => remove(user) },
      { text: t('moderation.block'), destructive: true, onPress: () => confirmBlock(user, friends.reload) },
    ]);
  };

  const incoming = (requests.data?.incoming ?? []).filter((r) => !hiddenRequests.includes(r.id));
  const outgoing = (requests.data?.outgoing ?? []).filter((r) => !hiddenRequests.includes(r.id));
  const list = (friends.data?.items ?? []).filter((f) => !hiddenFriends.includes(f.id));
  const invite = () => me && shareText(t('social.inviteMessage'), `${INVITE_BASE}${me.inviteCode}`);

  return (
    <Screen>
      {header}
      {offline ? <OfflineBanner style={{ marginBottom: space.md }} /> : null}

      {me ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} style={{ marginBottom: space.xl }}>
          <InviteCard code={me.inviteCode} />
        </Animated.View>
      ) : (
        <Skeleton height={190} radius={radius.lg} style={{ marginBottom: space.xl }} />
      )}

      {incoming.length > 0 ? (
        <Animated.View entering={FadeInDown.delay(40).springify().damping(18)} layout={LinearTransition}>
          <Group title={plural('social.requestsIn', incoming.length)}>
            {incoming.map((r, i) => (
              <Animated.View key={r.id} exiting={FadeOut.duration(160)} layout={LinearTransition.springify().damping(20)}>
                <PersonRow user={r.user} last={i === incoming.length - 1} onPress={() => router.push(`/user/${r.user.id}`)}>
                  <View style={{ flexDirection: 'row', gap: space.xs }}>
                    <Button title={t('social.decline')} variant="ghost" compact onPress={() => answer(r, false)} style={{ paddingHorizontal: space.sm }} />
                    <Button title={t('social.accept')} variant="friend" compact onPress={() => answer(r, true)} />
                  </View>
                </PersonRow>
              </Animated.View>
            ))}
          </Group>
        </Animated.View>
      ) : null}

      {outgoing.length > 0 ? (
        <Group title={t('social.requestsOut')}>
          {outgoing.map((r, i) => (
            <PersonRow key={r.id} user={r.user} last={i === outgoing.length - 1} onPress={() => router.push(`/user/${r.user.id}`)}>
              <Pill text={t('social.pending')} icon="clock" color={c.textSecondary} bg={c.surfaceRaised} />
            </PersonRow>
          ))}
        </Group>
      ) : null}

      {friends.loading && !friends.data ? (
        <SkeletonList rows={4} height={64} />
      ) : friends.error && !friends.data ? (
        <ErrorState error={friends.error} onRetry={friends.reload} />
      ) : list.length === 0 ? (
        <EmptyState icon="people" tint={c.friend} title={t('social.noFriendsTitle')} body={t('social.noFriendsBody')} action={t('social.inviteFriends')} onAction={invite} />
      ) : (
        <Animated.View entering={FadeInDown.delay(80).springify().damping(18)}>
          <Group title={plural('social.friendsCount', list.length)} footer={t('social.friendsHint')}>
            {list.map((f, i) => (
              <Animated.View key={f.id} exiting={FadeOut.duration(160)} layout={LinearTransition.springify().damping(20)}>
                <PersonRow user={f} last={i === list.length - 1} onPress={() => router.push(`/user/${f.id}`)} onLongPress={() => menu(f)} hint={t('social.friendHint')} />
              </Animated.View>
            ))}
          </Group>
        </Animated.View>
      )}
    </Screen>
  );
}
