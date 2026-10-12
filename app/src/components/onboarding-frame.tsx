import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/data/settings';
import { useT } from '@/i18n';
import { radius, space, type, useColors, useIsDark } from '@/theme';
import { success } from '@/ui-lib/haptics';
import { setLocalOnly, useSession } from '@/ui-lib/remote';

import { IconButton, ProgressBar } from './ui';

type StepName = 'permissions' | 'profile' | 'car' | 'recovery';

const FLOWS: Record<'full' | 'local', StepName[]> = {
  full: ['permissions', 'profile', 'car', 'recovery'],
  local: ['permissions', 'car'],
};

export function finishOnboarding() {
  success();
  useSettings.setState({ onboarded: true });
}

export function useFlow(current: StepName) {
  const { local } = useLocalSearchParams<{ local?: string }>();
  const { me } = useSession();
  const isLocal = local === '1';
  const steps = FLOWS[isLocal ? 'local' : 'full'];
  const index = Math.max(0, steps.indexOf(current));
  const following = steps[index + 1];
  return {
    local: isLocal,
    step: index + 1,
    total: steps.length,
    next() {
      if (following) {
        router.push({ pathname: `/onboarding/${following}`, params: isLocal ? { local: '1' } : {} });
        return;
      }
      if (isLocal && me && !me.privacy.localOnly) setLocalOnly(true).catch(() => undefined);
      finishOnboarding();
    },
  };
}

export function StepProgress({ step, total }: { step: number; total: number }) {
  const c = useColors();
  const { t } = useT();
  return (
    <View style={styles.progress} accessible accessibilityRole="progressbar" accessibilityLabel={t('onboarding.step', { n: step, total })}>
      {Array.from({ length: total }).map((_, i) =>
        i === step - 1 ? (
          <ProgressBar key={i} value={1} height={4} track={c.surfaceRaised} style={{ flex: 1 }} />
        ) : (
          <View key={i} style={[styles.segment, { backgroundColor: i < step - 1 ? c.accent : c.surfaceRaised }]} />
        ),
      )}
    </View>
  );
}

export function OnboardingFrame({
  step,
  total,
  title,
  body,
  children,
  footer,
  scroll = true,
  onBack,
  hideBack,
}: {
  step: number;
  total: number;
  title: string;
  body?: string;
  children: ReactNode;
  footer: ReactNode;
  scroll?: boolean;
  onBack?: () => void;
  hideBack?: boolean;
}) {
  const c = useColors();
  const dark = useIsDark();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const back = hideBack ? undefined : (onBack ?? (router.canGoBack() ? () => router.back() : undefined));

  const header = (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={{ gap: space.sm, marginBottom: space.xl }}>
      <Text style={[type.title, { color: c.text }]} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={[type.body, { color: c.textSecondary }]}>{body}</Text> : null}
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        {back ? <IconButton icon="chevronLeft" label={t('common.back')} onPress={back} size={36} bg={c.surface} /> : <View style={{ width: 36 }} />}
        <StepProgress step={step} total={total} />
        <Text style={[type.mono, { color: c.textTertiary, width: 36, textAlign: 'right' }]}>
          {step}/{total}
        </Text>
      </View>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xl }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          indicatorStyle={dark ? 'white' : 'black'}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: space.xl }}>
          <View style={{ paddingHorizontal: space.lg }}>{header}</View>
          {children}
        </View>
      )}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg), borderTopColor: c.border, backgroundColor: c.background }]}>{footer}</View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.xs },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: radius.pill },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
