import * as Application from 'expo-application';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { HexMark } from '@/components/hex';
import { Group, Pill, Row, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { fonts, radius, space, type, useColors } from '@/theme';
import { LINKS } from '@/ui-lib/remote';

const enter = (i: number) => FadeInDown.springify().damping(18).delay(i * 60);

export default function About() {
  const c = useColors();
  const { t } = useT();
  const open = (url: string) => WebBrowser.openBrowserAsync(url, { controlsColor: c.accent, toolbarColor: c.background }).catch(() => undefined);
  const version = t('profile.settings.version', { v: Application.nativeApplicationVersion ?? '1.0.0', b: Application.nativeBuildVersion ?? '1' });

  return (
    <Screen>
      <Animated.View entering={enter(0)} style={[styles.brand, { backgroundColor: c.hero }]}>
        <HexMark size={84} color={c.accent} icon="road" filled />
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={[styles.name, { color: c.onHero }]}>{t('common.appName')}</Text>
          <Text style={[type.callout, { color: c.onHeroSecondary, textAlign: 'center' }]}>{t('profile.about.tagline')}</Text>
        </View>
        <Text style={[type.mono, { color: c.onHeroSecondary }]}>{version}</Text>
      </Animated.View>

      <Animated.View entering={enter(1)} style={[styles.oss, { backgroundColor: c.accentSoft }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={[type.bodyStrong, { color: c.text, flex: 1 }]}>{t('profile.about.ossTitle')}</Text>
          <Pill text="MIT" color={c.accentStrong} bg={c.surface} />
        </View>
        <Text style={[type.callout, { color: c.textSecondary }]}>{t('profile.about.ossBody')}</Text>
      </Animated.View>

      <Animated.View entering={enter(2)}>
        <Group>
          <Row icon="code" title={t('profile.about.source')} value={t('profile.about.sourceSub')} onPress={() => open(LINKS.github)} />
          <Row icon="globe" title={t('profile.about.website')} onPress={() => open(LINKS.website)} />
          <Row icon="shield" title={t('profile.about.privacy')} onPress={() => open(LINKS.privacy)} />
          <Row icon="doc" title={t('profile.about.imprint')} onPress={() => open(LINKS.imprint)} />
          <Row icon="info" title={t('profile.about.license')} value="MIT" last />
        </Group>
        <Text style={[type.caption, { color: c.textTertiary, textAlign: 'center' }]}>{t('profile.about.madeIn')}</Text>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxl, paddingHorizontal: space.xl, borderRadius: radius.xl, marginBottom: space.lg },
  name: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 36, letterSpacing: -1 },
  oss: { borderRadius: radius.lg, padding: space.lg, gap: space.sm, marginBottom: space.xl },
});
