import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { formatDistance } from '@/core/format';
import type { DriveSummary } from '@/core/types';
import { settings } from '@/data/settings';

import { s } from './strings';

export const FINISHED_CATEGORY = 'drive-finished';
export const ACTION_DONE = 'done';
export const ACTION_STILL_DRIVING = 'still-driving';
const CHANNEL = 'drives';

let ready: Promise<void> | null = null;

export function setupNotifications(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL, { name: s('channel'), importance: Notifications.AndroidImportance.DEFAULT });
      }
      await Notifications.setNotificationCategoryAsync(FINISHED_CATEGORY, [
        { identifier: ACTION_DONE, buttonTitle: s('done'), options: { opensAppToForeground: false } },
        { identifier: ACTION_STILL_DRIVING, buttonTitle: s('stillDriving'), options: { opensAppToForeground: true } },
      ]);
    })().catch(() => {
      ready = null;
    });
  }
  return ready ?? Promise.resolve();
}

export const driveUrl = (id: string) => `/drive/${id}?fresh=1`;

export async function notifyFinished(drive: DriveSummary) {
  await setupNotifications();
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const distance = formatDistance(drive.distanceM, settings().units);
  const body =
    drive.startPlace && drive.endPlace
      ? s('finishedBody', { distance, from: drive.startPlace, to: drive.endPlace })
      : s('finishedBodyShort', { distance });
  await Notifications.scheduleNotificationAsync({
    identifier: `drive-${drive.id}`,
    content: {
      title: s('finishedTitle'),
      body,
      categoryIdentifier: FINISHED_CATEGORY,
      data: { kind: 'drive-finished', driveId: drive.id, url: driveUrl(drive.id) },
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
}

export function dismissFinished(id: string) {
  Notifications.dismissNotificationAsync(`drive-${id}`).catch(() => undefined);
}
