import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { HexMark } from '@/components/hex';
import { finishOnboarding } from '@/components/onboarding-frame';
import { RestoreForm } from '@/components/recovery-key';
import { SheetHeader } from '@/components/ui';
import { useSettings } from '@/data/settings';
import { useT } from '@/i18n';
import { space, type, useColors } from '@/theme';

export default function OnboardingRestore() {
  const c = useColors();
  const { t } = useT();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xxl }}>
      <SheetHeader title={t('profile.restore.title')} onClose={() => router.back()} closeLabel={t('common.close')} />
      <View style={{ paddingHorizontal: space.lg, gap: space.xl }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <HexMark size={44} color={c.accent} icon="key" />
          <Text style={[type.callout, { color: c.textSecondary, flex: 1 }]}>{t('profile.restore.body')}</Text>
        </View>
        <RestoreForm
          onRestored={() => {
            useSettings.setState({ localOnly: false });
            finishOnboarding();
          }}
        />
      </View>
    </ScrollView>
  );
}
