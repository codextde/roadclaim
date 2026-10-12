import { Platform } from 'react-native';

import { fonts, type Palette } from '@/theme';

export function pushedHeader(c: Palette) {
  return {
    headerShown: true,
    headerTransparent: Platform.OS === 'ios',
    headerBlurEffect: 'none' as const,
    headerStyle: Platform.OS === 'android' ? { backgroundColor: c.background } : undefined,
    headerTintColor: c.text,
    headerTitleStyle: { fontFamily: fonts.semibold, color: c.text },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
  };
}

export function largeTitleHeader(c: Palette) {
  return {
    headerShown: true,
    headerLargeTitle: Platform.OS === 'ios',
    headerLargeTitleShadowVisible: false,
    headerTransparent: Platform.OS === 'ios',
    headerBlurEffect: 'systemChromeMaterial' as const,
    headerLargeStyle: { backgroundColor: 'transparent' },
    headerStyle: Platform.OS === 'android' ? { backgroundColor: c.background } : undefined,
    headerTintColor: c.text,
    headerTitleStyle: { fontFamily: fonts.semibold, color: c.text },
    headerLargeTitleStyle: { fontFamily: fonts.bold, color: c.text },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: c.background },
  };
}

export function sheetOptions(c: Palette) {
  return {
    presentation: 'formSheet' as const,
    sheetGrabberVisible: true,
    sheetCornerRadius: 32,
    contentStyle: { backgroundColor: c.background },
  };
}
