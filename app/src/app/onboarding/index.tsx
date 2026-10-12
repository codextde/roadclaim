import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClaimHero } from '@/components/claim-hero';
import { HexMark } from '@/components/hex';
import type { IconName } from '@/components/icon-names';
import { Button, Label, tap } from '@/components/ui';
import { useSettings } from '@/data/settings';
import { useT } from '@/i18n';
import { brand, fonts, radius, space, type, useColors, useIsDark, withAlpha } from '@/theme';
import { impact } from '@/ui-lib/haptics';

const enter = (i: number) => FadeInDown.springify().damping(18).delay(120 + i * 70);

export default function Welcome() {
  const c = useColors();
  const dark = useIsDark();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const artHeight = Math.min(360, Math.round(height * 0.4));

  const points: { icon: IconName; title: string; body: string }[] = [
    { icon: 'bolt', title: t('onboarding.welcome.autoTitle'), body: t('onboarding.welcome.autoBody') },
    { icon: 'gauge', title: t('onboarding.welcome.statsTitle'), body: t('onboarding.welcome.statsBody') },
    { icon: 'hexagon', title: t('onboarding.welcome.mapTitle'), body: t('onboarding.welcome.mapBody') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} indicatorStyle={dark ? 'white' : 'black'} bounces={false}>
        <View style={[styles.hero, { backgroundColor: c.hero }]}>
          <View style={{ height: insets.top + artHeight }}>
            <View style={{ position: 'absolute', top: insets.top, left: 0 }}>
              <ClaimHero width={width} height={artHeight} />
            </View>
            <LinearGradient colors={[withAlpha(c.hero, 0), c.hero]} style={styles.fade} pointerEvents="none" />
          </View>
          <Animated.View entering={enter(0)} style={styles.heroText}>
            <View style={styles.brandRow}>
              <HexMark size={22} color={brand.emerald} filled />
              <Text style={[type.label, { color: c.onHero, letterSpacing: 2.4 }]}>{t('common.appName')}</Text>
            </View>
            <Text style={[styles.headline, { color: c.onHero }]} accessibilityRole="header">
              {t('onboarding.welcome.title')}
            </Text>
            <Text style={[type.body, { color: c.onHeroSecondary }]}>{t('onboarding.welcome.body')}</Text>
          </Animated.View>
        </View>

        <View style={styles.content}>
          <View style={{ gap: space.lg }}>
            {points.map((p, i) => (
              <Animated.View key={p.icon} entering={enter(i + 1)} style={styles.point}>
                <HexMark size={42} color={c.accent} icon={p.icon} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: c.text }]}>{p.title}</Text>
                  <Text style={[type.callout, { color: c.textSecondary }]}>{p.body}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          <Animated.View entering={enter(4)} style={[styles.safety, { backgroundColor: c.warnSoft, borderColor: withAlpha(c.warn, 0.3) }]}>
            <View style={styles.safetyHead}>
              <HexMark size={34} color={c.warn} icon="phoneOff" filled iconColor="#1A1100" />
              <Label color={c.warn}>{t('onboarding.welcome.safetyLabel')}</Label>
            </View>
            <Text style={[type.headline, { color: c.text }]}>{t('onboarding.welcome.safetyTitle')}</Text>
            <Text style={[type.callout, { color: c.textSecondary }]}>{t('onboarding.welcome.safetyBody')}</Text>
          </Animated.View>

          <Text style={[type.caption, { color: c.textTertiary, textAlign: 'center' }]}>{t('onboarding.welcome.free')}</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg), borderTopColor: c.border, backgroundColor: c.background }]}>
        <Button
          title={t('onboarding.welcome.start')}
          icon="arrowRight"
          large
          onPress={() => {
            impact('medium');
            useSettings.setState({ localOnly: false });
            router.push('/onboarding/permissions');
          }}
        />
        <Button
          title={t('onboarding.welcome.localOnly')}
          icon="lock"
          variant="secondary"
          onPress={() => {
            useSettings.setState({ localOnly: true });
            router.push({ pathname: '/onboarding/permissions', params: { local: '1' } });
          }}
        />
        <Pressable
          onPress={() => {
            tap();
            router.push('/onboarding/restore');
          }}
          hitSlop={8}
          accessibilityRole="button"
          style={styles.restore}>
          <Text style={[type.callout, { color: c.accentStrong, fontFamily: fonts.semibold }]}>{t('onboarding.welcome.restore')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderBottomLeftRadius: radius.xl + 4, borderBottomRightRadius: radius.xl + 4, overflow: 'hidden', paddingBottom: space.xxl },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  heroText: { paddingHorizontal: space.xl, gap: space.md, marginTop: -space.xxxl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headline: { fontFamily: fonts.bold, fontSize: 38, lineHeight: 42, letterSpacing: -1.3 },
  content: { paddingHorizontal: space.xl, paddingTop: space.xxl, gap: space.xxl },
  point: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  safety: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  safetyHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  restore: { alignSelf: 'center', paddingVertical: space.xs },
});
