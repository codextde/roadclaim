import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { HexMark } from '@/components/hex';
import { RecoveryKeyCard } from '@/components/recovery-key';
import { LocalOnlyState } from '@/components/states';
import { Notice, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { space, type, useColors } from '@/theme';
import { useRecoveryKey, useSession } from '@/ui-lib/remote';

export default function RecoveryKey() {
  const c = useColors();
  const { t } = useT();
  const { me } = useSession();
  const { data, error, loading, reload } = useRecoveryKey(!!me);
  const [hidden, setHidden] = useState(true);

  if (!me) {
    return (
      <Screen>
        <LocalOnlyState body={t('profile.form.noAccount')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Animated.View entering={FadeInDown.springify().damping(18)} style={{ gap: space.xl }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <HexMark size={44} color={c.accent} icon="key" />
          <Text style={[type.callout, { color: c.textSecondary, flex: 1 }]}>{t('onboarding.recovery.body')}</Text>
        </View>
        <RecoveryKeyCard value={data?.recoveryKey || null} loading={loading} error={error} onRetry={reload} hidden={hidden} onToggle={() => setHidden((h) => !h)} />
        <Notice tone="danger" icon="lock" title={t('profile.recovery.private')} />
        <Text style={[type.callout, { color: c.textSecondary, paddingHorizontal: space.xs }]}>{t('profile.recovery.howTo')}</Text>
      </Animated.View>
    </Screen>
  );
}
