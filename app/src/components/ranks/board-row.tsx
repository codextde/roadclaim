import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Value } from '@/components/ui';
import { useT } from '@/i18n';
import { fonts, radius, space, type, useColors, useIsDark, withAlpha } from '@/theme';
import { tap } from '@/ui-lib/haptics';
import type { BoardEntry } from '@/ui-lib/remote';

import { partsText, type ValueParts } from './format';

type RowProps = {
  rank: number;
  title: string;
  subtitle?: string;
  meta?: string;
  leading: ReactNode;
  value: ValueParts;
  valueColor?: string;
  highlight?: string;
  onPress?: () => void;
  index?: number;
  last?: boolean;
};

export function BoardRow({ rank, title, subtitle, meta, leading, value, valueColor, highlight, onPress, index = 0, last }: RowProps) {
  const c = useColors();
  const { t } = useT();
  return (
    <Animated.View entering={FadeInDown.springify().damping(18).delay(Math.min(index, 12) * 28)} layout={LinearTransition.springify().damping(20)}>
      <PressableScale
        scaleTo={0.98}
        disabled={!onPress}
        onPress={
          onPress
            ? () => {
                tap();
                onPress();
              }
            : undefined
        }
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={t('ranks.rankA11y', { rank, name: title, value: partsText(value) })}
        style={[styles.row, highlight ? { backgroundColor: withAlpha(highlight, 0.12) } : null]}>
        {highlight ? <View style={[styles.marker, { backgroundColor: highlight }]} /> : null}
        <Text style={[styles.rank, { color: rank <= 10 ? c.text : c.textTertiary }]} numberOfLines={1}>
          {rank}
        </Text>
        {leading}
        <View style={[styles.body, !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle || meta ? (
              <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={1}>
                {subtitle}
                {subtitle && meta ? <Text style={{ color: c.textTertiary }}>{'  ·  '}</Text> : null}
                {meta ? <Text style={{ color: c.textTertiary }}>{meta}</Text> : null}
              </Text>
            ) : null}
          </View>
          <Value value={value.value} unit={value.unit} size="valueSmall" color={valueColor} style={{ flexShrink: 0, maxWidth: '46%' }} />
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export function UserBoardRow({
  entry,
  value,
  isMe,
  onPress,
  index,
  last,
  valueColor,
}: {
  entry: BoardEntry;
  value: ValueParts;
  isMe?: boolean;
  onPress?: () => void;
  index?: number;
  last?: boolean;
  valueColor?: string;
}) {
  const c = useColors();
  const { t } = useT();
  return (
    <BoardRow
      rank={entry.rank}
      title={isMe ? `${entry.user.displayName} (${t('common.you')})` : entry.user.displayName}
      subtitle={`@${entry.user.username}`}
      meta={entry.user.car?.label}
      leading={<Avatar name={entry.user.displayName} color={entry.user.avatarColor} size={38} ring={isMe ? c.accent : undefined} />}
      value={value}
      valueColor={valueColor}
      highlight={isMe ? c.accent : undefined}
      onPress={onPress}
      index={index}
      last={last}
    />
  );
}

export function BoardList({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>;
}

export function PinnedMeBar({ entry, value, onPress, bottom, valueColor }: { entry: BoardEntry | null; value: ValueParts | null; onPress?: () => void; bottom?: number; valueColor?: string }) {
  const c = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const offset = bottom ?? (Platform.OS === 'ios' ? insets.bottom + 62 : space.md);
  const content = (
    <PressableScale
      scaleTo={0.98}
      disabled={!onPress || !entry}
      onPress={
        onPress
          ? () => {
              tap();
              onPress();
            }
          : undefined
      }
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={entry && value ? t('ranks.rankA11y', { rank: entry.rank, name: t('common.you'), value: partsText(value) }) : t('ranks.notRanked')}
      style={styles.pinnedInner}>
      <View style={[styles.pinnedRank, { backgroundColor: c.accent }]}>
        <Text style={[type.mono, { color: c.onAccent, fontFamily: fonts.numBold }]} numberOfLines={1} adjustsFontSizeToFit>
          {entry ? entry.rank : '–'}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.label, { color: c.accentStrong }]}>{t('ranks.yourRank')}</Text>
        <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
          {entry ? entry.user.displayName : t('ranks.notRanked')}
        </Text>
      </View>
      {value ? <Value value={value.value} unit={value.unit} size="valueSmall" color={valueColor} /> : null}
      {entry && onPress ? <Icon name="chevronRight" size={12} color={c.textTertiary} /> : null}
    </PressableScale>
  );
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.pinned, { bottom: offset, shadowColor: c.shadow }]}>
      <View style={[styles.pinnedClip, { borderColor: c.borderStrong }]}>
        {Platform.OS === 'ios' ? (
          <BlurView tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} intensity={90} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surfaceRaised }]} />
        )}
        {content}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, gap: space.md, minHeight: 64 },
  marker: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  rank: { ...type.mono, fontFamily: fonts.numBold, fontSize: 16, width: 28, textAlign: 'center' },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingRight: space.lg, minHeight: 64 },
  pinned: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    borderRadius: radius.lg,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pinnedClip: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  pinnedInner: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md - 2 },
  pinnedRank: { minWidth: 38, height: 38, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
});
