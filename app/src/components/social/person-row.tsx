import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { fonts, space, type, useColors } from '@/theme';
import type { PublicUser } from '@/ui-lib/remote';

export function PersonRow({
  user,
  last,
  onPress,
  onLongPress,
  hint,
  children,
}: {
  user: PublicUser;
  last?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  hint?: string;
  children?: ReactNode;
}) {
  const c = useColors();
  const meta = [`@${user.username}`, user.car?.label].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${user.displayName}, ${meta}${user.club ? `, ${user.club.name}` : ''}`}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfacePressed }]}>
      <Avatar name={user.displayName} color={user.avatarColor} size={42} />
      <View style={[styles.body, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderStrong }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[type.bodyStrong, { color: c.text, flexShrink: 1 }]} numberOfLines={1}>
              {user.displayName}
            </Text>
            {user.club ? <View style={[styles.clubDot, { backgroundColor: user.club.color }]} /> : null}
            {user.club ? (
              <Text style={[type.caption, { color: c.textTertiary, fontFamily: fonts.medium, flexShrink: 2 }]} numberOfLines={1}>
                {user.club.name}
              </Text>
            ) : null}
          </View>
          <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, gap: space.md },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingRight: space.md, minHeight: 64 },
  clubDot: { width: 7, height: 7, borderRadius: 4 },
});
