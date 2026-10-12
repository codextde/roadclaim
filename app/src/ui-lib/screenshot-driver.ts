import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, Settings } from 'react-native';

import { useDrives } from '@/data/drives';

import { setDemoDrives } from './demo-remote';

export const SCREENSHOTS = process.env.EXPO_PUBLIC_SCREENSHOTS === '1';

// Screenshot builds only: `xcrun simctl launch <udid> <bundle> -rcRoute /drive/{drive}` opens a route on launch.
export function useScreenshotRoute(ready: boolean) {
  const drives = useDrives();
  const done = useRef(false);
  const first = drives[0]?.id;
  if (SCREENSHOTS) setDemoDrives(drives);
  useEffect(() => {
    if (!SCREENSHOTS || Platform.OS !== 'ios' || done.current || !ready) return;
    const route = Settings.get('rcRoute');
    if (typeof route !== 'string' || !route) return;
    if (route.includes('{drive}') && !first) return;
    done.current = true;
    const target = route.replace('{drive}', first ?? '');
    const id = setTimeout(() => router.push(target as never), 400);
    return () => clearTimeout(id);
  }, [ready, first]);
}
