import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { OnboardingFrame, useFlow } from '@/components/onboarding-frame';
import { RecoveryKeyCard } from '@/components/recovery-key';
import { Button, Notice } from '@/components/ui';
import { useT } from '@/i18n';
import { space, type, useColors } from '@/theme';
import { impact } from '@/ui-lib/haptics';
import { useRecoveryKey } from '@/ui-lib/remote';

export default function RecoveryStep() {
  const c = useColors();
  const { t } = useT();
  const flow = useFlow('recovery');
  const { data, error, loading, reload } = useRecoveryKey();
  const key = data?.recoveryKey || null;

  return (
    <OnboardingFrame
      step={flow.step}
      total={flow.total}
      title={t('onboarding.recovery.title')}
      body={t('onboarding.recovery.body')}
      hideBack
      footer={
        <Button
          title={t('onboarding.recovery.finish')}
          icon="steering"
          large
          onPress={() => {
            impact('medium');
            flow.next();
          }}
        />
      }>
      <View style={{ gap: space.lg }}>
        <Animated.View entering={FadeInDown.springify().damping(18).delay(80)}>
          {error && !key ? (
            <Notice tone="warn" icon="offline" title={t('onboarding.recovery.error')} action={t('common.retry')} onAction={reload} />
          ) : (
            <RecoveryKeyCard value={key} loading={loading} />
          )}
        </Animated.View>
        <Animated.View entering={FadeInDown.springify().damping(18).delay(160)} style={{ gap: space.md }}>
          <Notice tone="danger" icon="lock" title={t('profile.recovery.private')} />
          <Text style={[type.callout, { color: c.textSecondary, paddingHorizontal: space.xs }]}>{t('profile.recovery.howTo')}</Text>
        </Animated.View>
      </View>
    </OnboardingFrame>
  );
}
