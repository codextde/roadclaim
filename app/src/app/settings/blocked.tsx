import { useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { confirmUnblock } from '@/components/moderation';
import { EmptyState, ErrorState, LocalOnlyState, SkeletonList } from '@/components/states';
import { Button, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { radius, space, type, useColors } from '@/theme';
import { type PublicUser, useBlocks, useLocalOnly } from '@/ui-lib/remote';

export default function Blocked() {
  const c = useColors();
  const { t } = useT();
  const localOnly = useLocalOnly();
  const { data, error, loading, reload } = useBlocks();
  const [refreshing, setRefreshing] = useState(false);

  if (localOnly) {
    return (
      <Screen>
        <LocalOnlyState />
      </Screen>
    );
  }

  const items: PublicUser[] = data?.items ?? [];

  async function refresh() {
    setRefreshing(true);
    await Promise.resolve(reload()).catch(() => undefined);
    setRefreshing(false);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} />}>
      {loading && !data ? (
        <SkeletonList rows={4} height={64} />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState icon="hand" title={t('moderation.blockedEmpty')} tint={c.textSecondary} />
      ) : (
        <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
          {items.map((user, i) => (
            <Animated.View
              key={user.id}
              entering={FadeInDown.springify().damping(18).delay(i * 40)}
              layout={LinearTransition}
              style={[styles.row, i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderStrong }]}>
              <Avatar name={user.displayName} color={user.avatarColor} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
                  {user.displayName}
                </Text>
                <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={1}>
                  @{user.username}
                </Text>
              </View>
              <Button title={t('moderation.unblock')} variant="secondary" compact onPress={() => confirmUnblock(user, reload)} />
            </Animated.View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});
