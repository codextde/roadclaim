import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HexMark } from '@/components/hex';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { Button } from '@/components/ui';
import { useT } from '@/i18n';
import { radius, space, type, useColors } from '@/theme';
import { declineAutoDetect, grantAutoDetect, settleDisclosure } from '@/ui-lib/auto-detect';
import { failure, success } from '@/ui-lib/haptics';

export default function Disclosure() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  useEffect(() => () => settleDisclosure(false), []);

  const allow = async () => {
    setBusy(true);
    try {
      const on = await grantAutoDetect();
      if (on) success();
      settleDisclosure(on);
    } catch {
      failure();
      settleDisclosure(false);
    } finally {
      setBusy(false);
      router.back();
    }
  };

  const notNow = async () => {
    await declineAutoDetect();
    settleDisclosure(false);
    router.back();
  };

  const uses: { icon: IconName; text: string }[] = [
    { icon: 'route', text: t('disclosure.useRoute') },
    { icon: 'gauge', text: t('disclosure.useStats') },
    { icon: 'hexagon', text: t('disclosure.useCells') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + space.xl, gap: space.xl }}>
        <Animated.View entering={FadeInDown.springify().damping(18)} style={{ gap: space.lg }}>
          <HexMark size={72} color={c.accent} icon="location" />
          <View style={{ gap: space.sm }}>
            <Text style={[type.label, { color: c.accentStrong }]}>{t('disclosure.eyebrow')}</Text>
            <Text style={[type.title, { color: c.text }]} accessibilityRole="header">
              {t('disclosure.title')}
            </Text>
          </View>
          <View style={[styles.required, { backgroundColor: c.accentSoft, borderColor: c.accentGlow }]}>
            <Text style={[type.bodyStrong, { color: c.text }]}>{t('disclosure.required')}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).springify().damping(18)} style={{ gap: space.md }}>
          <Text style={[type.label, { color: c.textTertiary }]}>{t('disclosure.usedFor')}</Text>
          {uses.map((u) => (
            <View key={u.icon} style={styles.use}>
              <View style={[styles.useIcon, { backgroundColor: c.surfaceRaised }]}>
                <Icon name={u.icon} size={16} color={c.accentStrong} />
              </View>
              <Text style={[type.body, { color: c.text, flex: 1 }]}>{u.text}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).springify().damping(18)} style={{ gap: space.md }}>
          <Text style={[type.callout, { color: c.textSecondary }]}>{t('disclosure.motion')}</Text>
          <View style={[styles.privacy, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Icon name="lock" size={15} color={c.textSecondary} style={{ marginTop: 2 }} />
            <Text style={[type.callout, { color: c.textSecondary, flex: 1 }]}>{t('disclosure.privacy')}</Text>
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md, borderTopColor: c.border, backgroundColor: c.background }]}>
        <Text style={[type.caption, { color: c.textTertiary, textAlign: 'center' }]}>
          {Platform.OS === 'ios' ? t('disclosure.alwaysHintIos') : t('disclosure.alwaysHintAndroid')}
        </Text>
        <Button title={t('disclosure.allow')} onPress={allow} loading={busy} large />
        <Button title={t('disclosure.notNow')} onPress={notNow} variant="ghost" disabled={busy} />
        <Text style={[type.caption, { color: c.textTertiary, textAlign: 'center' }]}>{t('disclosure.notNowHint')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  required: { borderRadius: radius.md, borderWidth: 1, padding: space.lg },
  use: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  useIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', gap: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md + 2 },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
