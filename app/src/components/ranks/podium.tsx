import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Value } from '@/components/ui';
import { useT } from '@/i18n';
import { fonts, radius, space, spring, tierColor, type, useColors, withAlpha } from '@/theme';
import { tap } from '@/ui-lib/haptics';
import type { BoardEntry } from '@/ui-lib/remote';

import { partsText, type ValueParts } from './format';

const SLOTS = [
  { place: 2, plinth: 70, avatar: 58, delay: 90 },
  { place: 1, plinth: 100, avatar: 76, delay: 0 },
  { place: 3, plinth: 52, avatar: 54, delay: 160 },
] as const;

export function Podium({
  entries,
  format,
  meId,
  onPress,
}: {
  entries: BoardEntry[];
  format: (v: number) => ValueParts;
  meId?: string;
  onPress: (entry: BoardEntry) => void;
}) {
  const { t } = useT();
  const byPlace = new Map(entries.slice(0, 3).map((e, i) => [i + 1, e]));
  return (
    <View style={styles.podium} accessibilityLabel={t('ranks.podium')}>
      {SLOTS.map((slot) => {
        const entry = byPlace.get(slot.place);
        return (
          <View key={slot.place} style={styles.column}>
            {entry ? (
              <PodiumColumn
                key={`${entry.user.id}:${entry.value}`}
                entry={entry}
                place={slot.place}
                plinth={slot.plinth}
                avatar={slot.avatar}
                delay={slot.delay}
                value={format(entry.value)}
                isMe={entry.user.id === meId}
                onPress={() => onPress(entry)}
              />
            ) : (
              <EmptyPlinth height={slot.plinth} place={slot.place} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function PodiumColumn({
  entry,
  place,
  plinth,
  avatar,
  delay,
  value,
  isMe,
  onPress,
}: {
  entry: BoardEntry;
  place: number;
  plinth: number;
  avatar: number;
  delay: number;
  value: ValueParts;
  isMe: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const { t } = useT();
  const tint = tierColor(c, 4 - place);
  const height = useSharedValue(0);
  const pop = useSharedValue(0.6);
  useEffect(() => {
    height.value = withDelay(delay, withSpring(plinth, spring.soft));
    pop.value = withDelay(delay + 80, withSequence(withSpring(1.08, spring.bouncy), withSpring(1, spring.snappy)));
  }, [delay, height, plinth, pop]);
  const plinthStyle = useAnimatedStyle(() => ({ height: height.value }));
  const avatarStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const first = place === 1;
  return (
    <PressableScale
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('ranks.rankA11y', { rank: place, name: entry.user.displayName, value: partsText(value) })}
      style={styles.columnInner}>
      <Animated.View entering={FadeInDown.springify().damping(18).delay(delay)} style={styles.head}>
        {first ? <Icon name="crown" size={18} color={c.gold} style={{ marginBottom: 2 }} /> : null}
        <Animated.View style={avatarStyle}>
          <View style={[styles.halo, { width: avatar + 12, height: avatar + 12, borderRadius: (avatar + 12) / 2, backgroundColor: withAlpha(tint, first ? 0.2 : 0.12) }]}>
            <Avatar name={entry.user.displayName} color={entry.user.avatarColor} size={avatar} ring={tint} />
          </View>
        </Animated.View>
        <Text style={[type.callout, { color: c.text, fontFamily: fonts.semibold, marginTop: space.sm, maxWidth: '100%' }]} numberOfLines={1}>
          {isMe ? t('common.you') : entry.user.displayName}
        </Text>
        <Value value={value.value} unit={value.unit} size={first ? 'value' : 'valueSmall'} />
      </Animated.View>
      <Animated.View style={[styles.plinth, { backgroundColor: c.surface, borderColor: c.border }, plinthStyle]}>
        <LinearGradient colors={[withAlpha(tint, first ? 0.32 : 0.22), withAlpha(tint, 0)]} style={StyleSheet.absoluteFill} />
        <View style={[styles.plinthEdge, { backgroundColor: tint }]} />
        <Text style={[styles.place, { color: tint }]} allowFontScaling={false}>
          {place}
        </Text>
      </Animated.View>
    </PressableScale>
  );
}

function EmptyPlinth({ height, place }: { height: number; place: number }) {
  const c = useColors();
  return (
    <View style={styles.columnInner}>
      <View style={[styles.plinth, { height, backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
        <Text style={[styles.place, { color: c.textTertiary, opacity: 0.5 }]}>{place}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, minHeight: 230 },
  column: { flex: 1 },
  columnInner: { alignItems: 'stretch', justifyContent: 'flex-end' },
  head: { alignItems: 'center', paddingHorizontal: 2, marginBottom: space.md, gap: 2 },
  halo: { alignItems: 'center', justifyContent: 'center' },
  plinth: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, overflow: 'hidden', alignItems: 'center', paddingTop: space.sm },
  plinthEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  place: { fontFamily: fonts.numBold, fontSize: 34, lineHeight: 38, fontVariant: ['tabular-nums'] },
});
