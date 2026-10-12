import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { showError } from '@/components/social/action-menu';
import { useDebounced } from '@/components/social/hooks';
import { InviteCard } from '@/components/social/invite-card';
import { PersonRow } from '@/components/social/person-row';
import { EmptyState, ErrorState, LocalOnlyState, SkeletonList } from '@/components/states';
import { Button, Group, Pill, Screen, SearchField, SheetHeader } from '@/components/ui';
import { useT } from '@/i18n';
import { space, type, useColors } from '@/theme';
import { success } from '@/ui-lib/haptics';
import { remote, useFriends, useLocalOnly, useSession, useUserSearch } from '@/ui-lib/remote';

export default function AddFriendSheet() {
  const c = useColors();
  const { t } = useT();
  const localOnly = useLocalOnly();
  const { me } = useSession();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const search = useUserSearch(query);
  const friends = useFriends();
  const [requested, setRequested] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  const add = async (id: string) => {
    setPending(id);
    try {
      await remote.requestFriend(id);
      success();
      setRequested((r) => [...r, id]);
    } catch (e) {
      showError(e);
    } finally {
      setPending(null);
    }
  };

  const friendIds = new Set((friends.data?.items ?? []).map((f) => f.id));
  const results = (search.data?.items ?? []).filter((u) => u.id !== me?.id);
  const searching = query.length >= 2;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <SheetHeader title={t('social.addFriends')} onClose={() => router.back()} closeLabel={t('common.close')} />
      {localOnly ? (
        <LocalOnlyState title={t('social.localOnlyTitle')} body={t('social.localOnlyFriends')} />
      ) : (
        <Screen bottomInset={space.xxxl} contentContainerStyle={{ paddingTop: 0 }}>
          <SearchField value={q} onChangeText={setQ} placeholder={t('social.searchUsers')} autoFocus />
          <View style={{ marginTop: space.lg }}>
            {!searching ? (
              <Animated.View entering={FadeIn.duration(220)} style={{ gap: space.xl }}>
                <Text style={[type.caption, { color: c.textTertiary, marginHorizontal: space.xs }]}>{t('social.searchHint')}</Text>
                {me ? <InviteCard code={me.inviteCode} /> : null}
              </Animated.View>
            ) : search.loading && !search.data ? (
              <SkeletonList rows={3} height={64} />
            ) : search.error ? (
              <ErrorState error={search.error} onRetry={search.reload} />
            ) : results.length === 0 ? (
              <EmptyState icon="search" tint={c.friend} title={t('social.noResults')} body={t('social.noResultsBody', { q: query })} />
            ) : (
              <Animated.View entering={FadeInDown.springify().damping(18)}>
                <Group>
                  {results.map((u, i) => {
                    const isFriend = friendIds.has(u.id);
                    const isRequested = requested.includes(u.id);
                    return (
                      <PersonRow key={u.id} user={u} last={i === results.length - 1} onPress={() => router.push(`/user/${u.id}`)}>
                        {isFriend ? (
                          <Pill text={t('social.friends')} icon="check" color={c.friend} bg={c.friendSoft} />
                        ) : isRequested ? (
                          <Pill text={t('social.requested')} icon="clock" color={c.textSecondary} bg={c.surfaceRaised} />
                        ) : (
                          <Button title={t('common.add')} icon="personAdd" variant="friend" compact loading={pending === u.id} onPress={() => add(u.id)} />
                        )}
                      </PersonRow>
                    );
                  })}
                </Group>
              </Animated.View>
            )}
          </View>
        </Screen>
      )}
    </View>
  );
}
