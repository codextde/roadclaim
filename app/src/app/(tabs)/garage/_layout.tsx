import { Stack } from 'expo-router';

import { useT } from '@/i18n';
import { useColors } from '@/theme';
import { largeTitleHeader } from '@/ui-lib/nav';

export default function GarageLayout() {
  const c = useColors();
  const { t } = useT();
  return (
    <Stack screenOptions={largeTitleHeader(c)}>
      <Stack.Screen name="index" options={{ title: t('tabs.garage') }} />
    </Stack>
  );
}
