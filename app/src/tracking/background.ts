import type { LocationObject } from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import type { DriveDetectEvent } from '../../modules/drive-detect';
import { bootRecorder, DRIVE_TASK, GPS_TASK, handleDetectEvent, handleWatch, ingest, WATCH_TASK } from './recorder';

type LocationData = { locations?: LocationObject[] } | undefined;

TaskManager.defineTask(GPS_TASK, async ({ data, error }) => {
  if (error) return;
  await ingest((data as LocationData)?.locations ?? []).catch(() => undefined);
});

TaskManager.defineTask(WATCH_TASK, async ({ data, error }) => {
  if (error) return;
  await handleWatch((data as LocationData)?.locations ?? []).catch(() => undefined);
});

TaskManager.defineTask(DRIVE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  await handleDetectEvent(data as DriveDetectEvent).catch(() => undefined);
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

bootRecorder();
