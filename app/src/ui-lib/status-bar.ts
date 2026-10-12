import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { create } from 'zustand';

import { useIsDark } from '@/theme';

type Style = 'light' | 'dark';

const useOverride = create<{ style: Style | null }>(() => ({ style: null }));

export function useAppStatusBarStyle(): Style {
  const dark = useIsDark();
  const override = useOverride((s) => s.style);
  return override ?? (dark ? 'light' : 'dark');
}

export function useStatusBarStyle(style: Style) {
  useFocusEffect(
    useCallback(() => {
      useOverride.setState({ style });
      return () => {
        if (useOverride.getState().style === style) useOverride.setState({ style: null });
      };
    }, [style]),
  );
}
