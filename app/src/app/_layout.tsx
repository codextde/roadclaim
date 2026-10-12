import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSettings } from '@/data/settings';
import { useT } from '@/i18n';
import { onDriveFinished, useDriveNotifications } from '@/tracking/recorder';
import { useColors, useIsDark } from '@/theme';
import { iconFonts, textFonts } from '@/ui-lib/fonts';
import { pushedHeader, sheetOptions } from '@/ui-lib/nav';
import { SCREENSHOTS, useScreenshotRoute } from '@/ui-lib/screenshot-driver';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 250 });


export const unstable_settings = {
  anchor: '(tabs)',
};

function useThemePreference() {
  const pref = useSettings((s) => s.theme);
  useEffect(() => {
    Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
  }, [pref]);
}

function useDriveFinishedRouting(enabled: boolean) {
  useDriveNotifications();
  useEffect(() => {
    if (!enabled) return;
    return onDriveFinished((id: string) => router.push(`/drive/${id}?fresh=1`));
  }, [enabled]);
}

function Navigator() {
  const onboarded = useSettings((s) => s.onboarded);
  const c = useColors();
  const dark = useIsDark();
  const { t } = useT();
  useThemePreference();
  useDriveFinishedRouting(onboarded);
  useScreenshotRoute(true);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.background).catch(() => undefined);
  }, [c.background]);

  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.accent, background: c.background, card: c.background, text: c.text, border: c.border },
  };
  const pushed = pushedHeader(c);
  const sheet = sheetOptions(c);
  const modal = { presentation: 'modal' as const, contentStyle: { backgroundColor: c.background } };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="drive/[id]/index" options={{ ...pushed, title: '', headerTransparent: true, headerStyle: undefined }} />
          <Stack.Screen name="drive/[id]/replay" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="drive/[id]/share" options={{ ...sheet, sheetAllowedDetents: [0.92] }} />
          <Stack.Screen name="recap" options={{ ...sheet, sheetAllowedDetents: [0.92] }} />
          <Stack.Screen name="user/[id]" options={{ ...pushed, title: '' }} />
          <Stack.Screen name="season" options={{ ...pushed, title: t('ranks.seasonTitle') }} />
          <Stack.Screen name="friends/index" options={{ ...pushed, title: t('social.friendsTitle') }} />
          <Stack.Screen name="friends/add" options={modal} />
          <Stack.Screen name="i/[code]" options={{ ...sheet, sheetAllowedDetents: [0.5] }} />
          <Stack.Screen name="clubs/index" options={{ ...pushed, title: t('social.clubTitle') }} />
          <Stack.Screen name="clubs/[id]" options={{ ...pushed, title: '' }} />
          <Stack.Screen name="clubs/create" options={modal} />
          <Stack.Screen name="clubs/join" options={modal} />
          <Stack.Screen name="car" options={modal} />
          <Stack.Screen name="mods/new" options={{ ...pushed, title: t('garage.modsNewTitle') }} />
          <Stack.Screen name="mods/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="trophies" options={{ ...pushed, title: t('profile.trophiesTitle') }} />
          <Stack.Screen name="settings/profile" options={{ ...pushed, title: t('profile.editTitle') }} />
          <Stack.Screen name="settings/recovery" options={{ ...pushed, title: t('profile.recoveryTitle') }} />
          <Stack.Screen name="settings/restore" options={modal} />
          <Stack.Screen name="report" options={modal} />
          <Stack.Screen name="settings/blocked" options={{ ...pushed, title: t('moderation.blockedUsers') }} />
          <Stack.Screen name="settings/about" options={{ ...pushed, title: t('profile.aboutTitle') }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={SCREENSHOTS}>
          <Stack.Screen name="seed" />
        </Stack.Protected>
        <Stack.Screen name="disclosure" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ ...textFonts, ...iconFonts });
  const [timedOut, setTimedOut] = useState(false);
  const c = useColors();

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 2500);
    return () => clearTimeout(id);
  }, []);

  const ready = loaded || !!error || timedOut;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <Navigator />
    </GestureHandlerRootView>
  );
}
