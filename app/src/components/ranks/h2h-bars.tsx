import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { useT } from '@/i18n';
import { fonts, radius, space, spring, type, useColors, withAlpha } from '@/theme';
import type { PublicUser } from '@/ui-lib/remote';

export function H2HHeader({ me, them, mine, theirs }: { me: { name: string; color: string }; them: PublicUser; mine: number; theirs: number }) {
  const c = useColors();
  const { t } = useT();
  const verdict = mine > theirs ? t('ranks.h2hYouLead') : theirs > mine ? t('ranks.h2hTheyLead', { name: them.displayName }) : t('ranks.h2hTied');
  const verdictColor = mine > theirs ? c.accentStrong : theirs > mine ? c.friend : c.textSecondary;
  return (
    <View style={styles.header} accessible accessibilityLabel={`${t('common.you')} ${mine}, ${them.displayName} ${theirs}. ${verdict}`}>
      <View style={styles.side}>
        <Avatar name={me.name} color={me.color} size={44} ring={c.accent} />
        <Text style={[type.callout, { color: c.text, fontFamily: fonts.semibold }]} numberOfLines={1}>
          {t('common.you')}
        </Text>
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <View style={styles.score}>
          <Text style={[type.display, { color: mine >= theirs ? c.accentStrong : c.textSecondary }]}>{mine}</Text>
          <Text style={[type.value, { color: c.textTertiary }]}>{'–'}</Text>
          <Text style={[type.display, { color: theirs >= mine ? c.friend : c.textSecondary }]}>{theirs}</Text>
        </View>
        <Text style={[type.label, { color: verdictColor }]}>{verdict}</Text>
      </View>
      <View style={styles.side}>
        <Avatar name={them.displayName} color={them.avatarColor} size={44} ring={c.friend} />
        <Text style={[type.callout, { color: c.text, fontFamily: fonts.semibold }]} numberOfLines={1}>
          {them.displayName}
        </Text>
      </View>
    </View>
  );
}

export function H2HRow({ label, mine, theirs, mineText, theirsText, name, index = 0 }: { label: string; mine: number; theirs: number; mineText: string; theirsText: string; name: string; index?: number }) {
  const c = useColors();
  const { t } = useT();
  const max = Math.max(mine, theirs, 0);
  const left = max > 0 ? mine / max : 0;
  const right = max > 0 ? theirs / max : 0;
  const iWin = mine > theirs;
  const theyWin = theirs > mine;
  const l = useSharedValue(0);
  const r = useSharedValue(0);
  useEffect(() => {
    l.value = withDelay(120 + index * 70, withSpring(left, spring.soft));
    r.value = withDelay(120 + index * 70, withSpring(right, spring.soft));
  }, [index, l, left, r, right]);
  const leftStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, l.value) * 100}%` }));
  const rightStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, r.value) * 100}%` }));
  return (
    <View style={styles.row} accessible accessibilityLabel={t('ranks.h2hA11y', { label, mine: mineText, name, theirs: theirsText })}>
      <View style={styles.labels}>
        <Text style={[styles.num, { textAlign: 'left', color: iWin ? c.accentStrong : c.textSecondary, fontFamily: iWin ? fonts.numBold : fonts.numMedium }]} numberOfLines={1}>
          {mineText}
        </Text>
        <Text style={[type.caption, { color: c.textSecondary, textAlign: 'center', flexShrink: 1 }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.num, { textAlign: 'right', color: theyWin ? c.friend : c.textSecondary, fontFamily: theyWin ? fonts.numBold : fonts.numMedium }]} numberOfLines={1}>
          {theirsText}
        </Text>
      </View>
      <View style={styles.bars}>
        <View style={[styles.half, { alignItems: 'flex-end', backgroundColor: c.surfaceSunken, borderTopLeftRadius: radius.pill, borderBottomLeftRadius: radius.pill }]}>
          <Animated.View style={[styles.bar, styles.barLeft, { backgroundColor: iWin ? c.accent : withAlpha(c.accent, 0.4) }, leftStyle]} />
        </View>
        <View style={[styles.mid, { backgroundColor: c.borderStrong }]} />
        <View style={[styles.half, { alignItems: 'flex-start', backgroundColor: c.surfaceSunken, borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill }]}>
          <Animated.View style={[styles.bar, styles.barRight, { backgroundColor: theyWin ? c.friend : withAlpha(c.friend, 0.4) }, rightStyle]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  side: { flex: 1, alignItems: 'center', gap: space.xs },
  score: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { gap: 6 },
  labels: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  num: { ...type.valueSmall, fontSize: 19, flex: 1 },
  bars: { flexDirection: 'row', alignItems: 'center', height: 10 },
  half: { flex: 1, height: 8, overflow: 'hidden' },
  mid: { width: 2, height: 14, borderRadius: 1, marginHorizontal: 2 },
  bar: { height: 8 },
  barLeft: { borderTopLeftRadius: radius.pill, borderBottomLeftRadius: radius.pill },
  barRight: { borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill },
});
