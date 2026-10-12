import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { OnboardingFrame, useFlow } from '@/components/onboarding-frame';
import { ProfileFields, useProfileDraft } from '@/components/profile-form';
import { Skeleton } from '@/components/states';
import { Button, Notice } from '@/components/ui';
import { useT } from '@/i18n';
import { space } from '@/theme';
import { useSession } from '@/ui-lib/remote';

export default function ProfileStep() {
  const { t } = useT();
  const flow = useFlow('profile');
  const session = useSession();
  const draft = useProfileDraft(session.me);
  const [failed, setFailed] = useState<'offline' | 'error' | null>(null);
  const noAccount = session.ready && !session.me;

  async function onContinue() {
    if (noAccount) return flow.next();
    const result = await draft.save();
    if (result === 'ok') return flow.next();
    if (result === 'offline' || result === 'error') setFailed(result);
  }

  return (
    <OnboardingFrame
      step={flow.step}
      total={flow.total}
      title={t('onboarding.profile.title')}
      body={t('onboarding.profile.body')}
      footer={
        <>
          <Button title={t('common.continue')} icon="arrowRight" large loading={draft.saving} disabled={!session.ready || (!noAccount && !draft.valid)} onPress={onContinue} />
          {failed ? <Button title={t('onboarding.profile.continueAnyway')} variant="ghost" onPress={flow.next} /> : null}
        </>
      }>
      {noAccount || failed ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} style={{ marginBottom: space.xl }}>
          <Notice
            tone={failed === 'error' ? 'danger' : 'warn'}
            icon={failed === 'error' ? 'warning' : 'offline'}
            title={failed === 'error' ? t('common.errorTitle') : t('onboarding.profile.offlineTitle')}
            body={failed === 'error' ? t('profile.settings.saveFailed') : t('onboarding.profile.offlineBody')}
          />
        </Animated.View>
      ) : null}
      {noAccount ? null : session.me ? (
        <Animated.View entering={FadeInDown.springify().damping(18).delay(80)}>
          <ProfileFields draft={draft} />
        </Animated.View>
      ) : (
        <View style={{ gap: space.lg, alignItems: 'center' }}>
          <Skeleton width={92} height={92} radius={46} />
          <Skeleton height={50} />
          <Skeleton height={50} />
        </View>
      )}
    </OnboardingFrame>
  );
}
