import { router } from 'expo-router';

import { requestPermissions, setAutoDetect } from '@/tracking/recorder';

let pending: ((granted: boolean) => void) | null = null;

export function requestAutoDetect(): Promise<boolean> {
  pending?.(false);
  return new Promise((resolve) => {
    pending = resolve;
    router.push('/disclosure');
  });
}

export function settleDisclosure(granted: boolean) {
  pending?.(granted);
  pending = null;
}

export async function grantAutoDetect(): Promise<boolean> {
  let p = await requestPermissions('location-foreground');
  if (p.location === 'foreground') p = await requestPermissions('location-always');
  if (p.motion === 'undetermined') p = await requestPermissions('motion');
  const on = p.location === 'granted';
  await setAutoDetect(on).catch(() => undefined);
  return on;
}

export async function declineAutoDetect() {
  await setAutoDetect(false).catch(() => undefined);
}
