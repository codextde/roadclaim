import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useT } from '@/i18n';
import { useColors } from '@/theme';

const android = Platform.OS === 'android';

export default function TabsLayout() {
  const c = useColors();
  const { t } = useT();
  return (
    <NativeTabs
      tintColor={c.accentStrong}
      minimizeBehavior="onScrollDown"
      backgroundColor={android ? c.surface : undefined}
      indicatorColor={android ? c.accentSoft : undefined}
      iconColor={android ? { default: c.textSecondary, selected: c.accentStrong } : undefined}
      labelStyle={android ? { default: { color: c.textSecondary }, selected: { color: c.text } } : undefined}
      rippleColor={android ? c.accentSoft : undefined}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="(drives)">
        <NativeTabs.Trigger.Label>{t('tabs.drives')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'car', selected: 'car.fill' }} md="directions_car" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="map">
        <NativeTabs.Trigger.Label>{t('tabs.map')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'hexagon', selected: 'hexagon.fill' }} md="hexagon" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ranks">
        <NativeTabs.Trigger.Label>{t('tabs.ranks')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} md="leaderboard" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="garage">
        <NativeTabs.Trigger.Label>{t('tabs.garage')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'door.garage.closed', selected: 'door.garage.closed' }} md="garage" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{t('tabs.profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
