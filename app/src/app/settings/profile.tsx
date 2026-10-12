import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ProfileFields, useProfileDraft } from '@/components/profile-form';
import { ErrorState, LocalOnlyState, Skeleton } from '@/components/states';
import { Button, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { space } from '@/theme';
import { success } from '@/ui-lib/haptics';
import { type Me, useSession } from '@/ui-lib/remote';

function Editor({ me, refresh }: { me: Me; refresh: () => Promise<void> }) {
  const { t } = useT();
  const draft = useProfileDraft(me, { withCity: true });

  async function save() {
    const result = await draft.save();
    if (result === 'ok') {
      success();
      await refresh().catch(() => undefined);
      router.back();
    } else if (result === 'offline') {
      Alert.alert(t('common.offlineTitle'), t('profile.settings.saveFailed'));
    } else if (result === 'error') {
      Alert.alert(t('common.errorTitle'), t('profile.settings.saveFailed'));
    }
  }

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={{ gap: space.xxl }}>
      <ProfileFields draft={draft} withCity />
      <Button title={t('common.save')} icon="check" large loading={draft.saving} disabled={!draft.valid || !draft.dirty} onPress={save} />
    </Animated.View>
  );
}

export default function EditProfile() {
  const { t } = useT();
  const session = useSession();

  return (
    <Screen automaticallyAdjustKeyboardInsets bottomInset={space.xxxl * 2}>
      {!session.ready ? (
        <View style={{ gap: space.lg, alignItems: 'center' }}>
          <Skeleton width={92} height={92} radius={46} />
          <Skeleton height={50} />
          <Skeleton height={50} />
          <Skeleton height={50} />
        </View>
      ) : session.me ? (
        <Editor me={session.me} refresh={session.refresh} />
      ) : session.offline ? (
        <ErrorState error={{ code: 'offline' }} onRetry={() => session.refresh()} />
      ) : (
        <LocalOnlyState body={t('profile.form.noAccount')} />
      )}
    </Screen>
  );
}
