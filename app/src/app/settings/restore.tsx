import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { HexMark } from '@/components/hex';
import { RestoreForm } from '@/components/recovery-key';
import { SheetHeader } from '@/components/ui';
import { useSettings } from '@/data/settings';
import { useT } from '@/i18n';
import { space, type, useColors } from '@/theme';
import { useSession } from '@/ui-lib/remote';

export default function Restore() {
  const c = useColors();
  const { t } = useT();
  const { me } = useSession();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xxl }}>
      <SheetHeader title={t('profile.restore.title')} onClose={() => router.back()} closeLabel={t('common.close')} />
      <View style={{ paddingHorizontal: space.lg, gap: space.xl }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <HexMark size={44} color={c.accent} icon="restore" />
          <Text style={[type.callout, { color: c.textSecondary, flex: 1 }]}>{t('profile.restore.body')}</Text>
        </View>
        <RestoreForm
          showReplaceNotice={!!me}
          onRestored={() => {
            useSettings.setState({ localOnly: false });
            router.back();
          }}
        />
      </View>
    </ScrollView>
  );
}
