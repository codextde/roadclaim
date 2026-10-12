import { randomUUID } from 'expo-crypto';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { syncPending } from '@/api/sync';
import { formatDistance } from '@/core/format';
import { haversine } from '@/core/geo';
import { cellsFor, computeMetrics, MAX_ACCURACY_M, saneSpeed, simplify, trimStationary } from '@/core/metrics';
import type { Drive, Fix, Permissions, RecorderState } from '@/core/types';
import { getMeta, setMeta } from '@/data/db';
import { allDrives, forgetDrive, getSummary, loadDrive, saveDrive } from '@/data/drives';
import { appendTrack, deleteTrack, readTrack } from '@/data/files';
import { settings, useSettings } from '@/data/settings';

import DriveDetect, { type DriveDetectEvent } from '../../modules/drive-detect';
import { ACTION_DONE, ACTION_STILL_DRIVING, dismissFinished, notifyFinished, setupNotifications } from './notify';
import { s } from './strings';

export const GPS_TASK = 'roadclaim-gps';
export const DRIVE_TASK = 'roadclaim-drive-detect';
export const WATCH_TASK = 'roadclaim-watch';

const MOVING_MPS = 5 / 3.6;
const FALLBACK_START_MPS = 20 / 3.6;
const OFF_AUTOMOTIVE_MS = 3 * 60_000;
const MIN_DISTANCE_M = 500;
const MIN_DURATION_S = 60;
const MIN_MANUAL_DISTANCE_M = 150;
const MIN_MANUAL_DURATION_S = 20;
const MAX_DRIVE_MS = 12 * 3600_000;
const ANCHOR_RADIUS_M = 100;
const FLUSH_EVERY = 10;
const RESUME_WINDOW_MS = 30 * 60_000;
const WAITING_MAX_MS = 30 * 60_000;
const IOS_WATCH_MS = 5 * 60_000;

type Live = {
  driveId: string;
  startedAt: number;
  manual: boolean;
  distanceM: number;
  last: Fix | null;
  anchor: { lat: number; lng: number } | null;
  lastMoveAt: number;
  speedMps: number | null;
  offAutomotiveSince: number | null;
};

type Store = {
  status: 'idle' | 'recording' | 'finishing';
  live: Live | null;
  fixes: Fix[];
  permissions: Permissions;
};

const LIVE_KEY = 'recorder.live';
const WAITING_KEY = 'recorder.waitingSince';

const useStore = create<Store>(() => ({
  status: 'idle',
  live: null,
  fixes: [],
  permissions: { location: 'undetermined', motion: DriveDetect ? 'undetermined' : 'unavailable', notifications: 'undetermined' },
}));

let buffer: Fix[] = [];
let recent: Fix[] = [];

function persistLive(live: Live | null) {
  useStore.setState({ live });
  setMeta(LIVE_KEY, live);
}

function flush() {
  const live = useStore.getState().live;
  if (!live) {
    buffer = [];
    return;
  }
  appendTrack(live.driveId, buffer);
  buffer = [];
  setMeta(LIVE_KEY, live);
}

export const toFix = (l: Location.LocationObject): Fix => ({
  t: l.timestamp,
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  alt: l.coords.altitude != null && l.coords.altitudeAccuracy != null && l.coords.altitudeAccuracy > 0 ? l.coords.altitude : null,
  speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
  heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
  acc: l.coords.accuracy ?? null,
});

const finishedListeners = new Set<(driveId: string) => void>();

export function onDriveFinished(cb: (driveId: string) => void) {
  finishedListeners.add(cb);
  return () => {
    finishedListeners.delete(cb);
  };
}

export type DiscardedDrive = { driveId: string; distanceM: number; durationS: number; manual: boolean };

const discardedListeners = new Set<(drive: DiscardedDrive) => void>();

/** Fires when a finished recording was too short to keep (auto: 500 m / 60 s, manual: 150 m / 20 s). */
export function onDriveDiscarded(cb: (drive: DiscardedDrive) => void) {
  discardedListeners.add(cb);
  return () => {
    discardedListeners.delete(cb);
  };
}

const hasModule = () => {
  try {
    return !!DriveDetect && DriveDetect.isAvailable();
  } catch {
    return false;
  }
};

const nativeDriving = () => {
  try {
    return hasModule() && !!DriveDetect?.getCurrentActivity().driving;
  } catch {
    return false;
  }
};

let lastNotice = 0;

function updateNotice(live: Live, force = false) {
  if (Platform.OS !== 'android' || !DriveDetect) return;
  const now = Date.now();
  if (!force && now - lastNotice < 15_000) return;
  lastNotice = now;
  DriveDetect.updateRecordingService(s('recordingTitle'), formatDistance(live.distanceM, settings().units)).catch(() => undefined);
}

export async function ingest(locations: Location.LocationObject[]) {
  if (!useStore.getState().live) await restoreRecording();
  const live = useStore.getState().live;
  if (!live || useStore.getState().status !== 'recording') {
    if (!live) await stopGpsTask();
    return;
  }
  const fixes = locations.map(toFix).sort((a, b) => a.t - b.t);
  const next = { ...live };
  const shown: Fix[] = [];
  for (const f of fixes) {
    if (f.t < live.startedAt - 60_000 || (next.last && f.t <= next.last.t)) continue;
    buffer.push(f);
    if (f.acc != null && f.acc > MAX_ACCURACY_M) continue;
    const prev = next.last;
    const d = prev ? haversine(prev, f) : 0;
    const dt = prev ? Math.max(1, (f.t - prev.t) / 1000) : 1;
    if (prev && d / dt > 70) continue;
    const positional = prev ? d / dt : null;
    const reported = saneSpeed(f.speed, positional);
    const jump = prev != null && d > Math.max(prev.acc ?? 10, f.acc ?? 10, 10);
    const fromAnchor = next.anchor ? haversine(next.anchor, f) : 0;
    const moved =
      (reported != null && reported >= MOVING_MPS) || (jump && (positional ?? 0) >= MOVING_MPS) || fromAnchor >= ANCHOR_RADIUS_M;
    if (prev && ((reported ?? 0) >= 1 || jump)) next.distanceM += d;
    if (moved || !next.anchor) {
      if (moved) next.lastMoveAt = Math.max(next.lastMoveAt, f.t);
      next.anchor = { lat: f.lat, lng: f.lng };
    }
    recent = [...recent.slice(-2), f];
    const first = recent[0];
    const span = (f.t - first.t) / 1000;
    const smoothed = recent.length > 1 && span > 0 ? haversine(first, f) / span : (positional ?? 0);
    next.speedMps = reported != null && (reported > 0 || smoothed <= 3) ? reported : smoothed;
    next.last = f;
    shown.push(f);
  }
  useStore.setState((st) => ({ live: next, fixes: shown.length ? [...st.fixes, ...shown] : st.fixes }));
  if (buffer.length >= FLUSH_EVERY) flush();
  updateNotice(next);
  await checkStop();
}

async function checkStop() {
  const { live, status } = useStore.getState();
  if (!live || status !== 'recording') return;
  const now = Date.now();
  const idleMs = settings().stopAfterMin * 60_000;
  const idle = now - Math.max(live.lastMoveAt, live.startedAt) >= idleMs;
  const leftCar = live.offAutomotiveSince != null && now - live.offAutomotiveSince >= OFF_AUTOMOTIVE_MS && (live.speedMps ?? 0) < 5;
  const tooLong = now - live.startedAt >= MAX_DRIVE_MS;
  if (idle || leftCar || tooLong) await finishRecording();
}

const gpsOptions = (androidOwnService: boolean): Location.LocationTaskOptions => ({
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,
  distanceInterval: 0,
  activityType: Location.ActivityType.AutomotiveNavigation,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  ...(Platform.OS === 'android' && !androidOwnService
    ? {
        foregroundService: {
          notificationTitle: s('recordingTitle'),
          notificationBody: s('recordingBody'),
          notificationColor: '#10B981',
          killServiceOnDestroy: false,
        },
      }
    : {}),
});

async function startGps() {
  if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false)) return;
  let ownService = false;
  if (Platform.OS === 'android' && DriveDetect) {
    const background = await Location.getBackgroundPermissionsAsync();
    if (background.granted) ownService = await DriveDetect.startRecordingService(s('recordingTitle'), '').catch(() => false);
    if (!ownService && AppState.currentState !== 'active') throw new Error('foreground_service_unavailable');
  }
  setMeta(WAITING_KEY, null);
  await Location.startLocationUpdatesAsync(GPS_TASK, gpsOptions(ownService));
}

async function stopGpsTask() {
  if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(GPS_TASK).catch(() => undefined);
  }
}

async function stopService() {
  setMeta(WAITING_KEY, null);
  if (Platform.OS === 'android') await DriveDetect?.stopRecordingService().catch(() => undefined);
}

async function stopGps() {
  await stopGpsTask();
  await stopService();
}

type Resume = { live: Live; fixes: Fix[]; replaces: string };

let starting: Promise<void> | null = null;

function startRecording(manual: boolean, resume?: Resume): Promise<void> {
  if (starting) {
    if (resume) return Promise.reject(new Error('start_in_flight'));
    if (!manual) return starting;
    return starting.then(() => {
      const live = useStore.getState().live;
      if (live && !live.manual) persistLive({ ...live, manual: true });
    });
  }
  starting = doStart(manual, resume).finally(() => {
    starting = null;
  });
  return starting;
}

async function doStart(manual: boolean, resume?: Resume) {
  const current = useStore.getState().live;
  if (current) {
    if (manual && !current.manual) persistLive({ ...current, manual: true });
    return;
  }
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) {
    await stopService();
    if (manual) throw new Error('location_permission');
    return;
  }
  const now = Date.now();
  const live: Live = resume?.live ?? {
    driveId: randomUUID(),
    startedAt: now,
    manual,
    distanceM: 0,
    last: null,
    anchor: null,
    lastMoveAt: now,
    speedMps: null,
    offAutomotiveSince: null,
  };
  buffer = [];
  recent = [];
  if (resume) appendTrack(live.driveId, resume.fixes);
  persistLive(live);
  useStore.setState({ status: 'recording', fixes: resume?.fixes ?? [] });
  await stopWatch();
  try {
    await startGps();
  } catch (e) {
    persistLive(null);
    deleteTrack(live.driveId);
    useStore.setState({ status: 'idle', fixes: [] });
    await stopGps();
    armDetection();
    if (manual || resume) throw e;
    return;
  }
  if (resume) forgetDrive(resume.replaces);
  updateNotice(live, true);
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    .then((loc) => ingest([loc]))
    .catch(() => undefined);
}

let finishing: Promise<string | null> | null = null;

export function finishRecording(): Promise<string | null> {
  if (!finishing) {
    finishing = doFinish().finally(() => {
      finishing = null;
    });
  }
  return finishing;
}

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

async function place(fix: Fix | undefined) {
  if (!fix) return null;
  const [a] = await withTimeout(Location.reverseGeocodeAsync({ latitude: fix.lat, longitude: fix.lng }), 8000, []);
  if (!a) return null;
  return { name: a.district ?? a.city ?? a.subregion ?? a.region ?? a.name ?? null, city: a.city ?? a.subregion ?? null, countryCode: a.isoCountryCode ?? null };
}

async function endLeg() {
  const keepWaiting = Platform.OS === 'android' && settings().autoDetect && nativeDriving();
  await stopGpsTask();
  if (keepWaiting) {
    setMeta(WAITING_KEY, Date.now());
    DriveDetect?.updateRecordingService(s('waitingTitle'), s('waitingBody')).catch(() => undefined);
  } else {
    await stopService();
  }
}

async function doFinish(): Promise<string | null> {
  const live = useStore.getState().live;
  if (!live) return null;
  useStore.setState({ status: 'finishing' });
  await endLeg();
  flush();
  const fixes = trimStationary(readTrack(live.driveId));
  const { metrics, events } = computeMetrics(fixes);
  const [minM, minS] = live.manual ? [MIN_MANUAL_DISTANCE_M, MIN_MANUAL_DURATION_S] : [MIN_DISTANCE_M, MIN_DURATION_S];
  if (metrics.distanceM < minM || metrics.durationS < minS) {
    const info = { driveId: live.driveId, distanceM: metrics.distanceM, durationS: metrics.durationS, manual: live.manual };
    discardedListeners.forEach((cb) => cb(info));
    deleteTrack(live.driveId);
    persistLive(null);
    useStore.setState({ status: 'idle', fixes: [] });
    await armDetection();
    return null;
  }
  const [from, to] = await Promise.all([place(fixes[0]), place(fixes[fixes.length - 1])]);
  const drive: Drive = {
    id: live.driveId,
    ...metrics,
    startedAt: new Date(fixes[0].t).toISOString(),
    endedAt: new Date(fixes[fixes.length - 1].t).toISOString(),
    startPlace: from?.name ?? null,
    endPlace: to?.name ?? null,
    city: from?.city ?? to?.city ?? null,
    countryCode: from?.countryCode ?? to?.countryCode ?? null,
    cells: cellsFor(fixes),
    preview: simplify(fixes, fixes.length > 3000 ? 25 : 12),
    uploaded: false,
    territory: null,
    fixes,
    events,
  };
  saveDrive(drive);
  deleteTrack(live.driveId);
  persistLive(null);
  useStore.setState({ status: 'idle', fixes: [] });
  if (AppState.currentState !== 'active') notifyFinished(drive).catch(() => undefined);
  finishedListeners.forEach((cb) => cb(drive.id));
  syncPending().catch(() => undefined);
  await armDetection();
  return drive.id;
}

export async function startManual(): Promise<void> {
  await ensureAndroidNotifications();
  await startRecording(true);
}

export async function stopManual(): Promise<void> {
  await finishRecording();
}

export async function discardCurrent(): Promise<void> {
  const live = useStore.getState().live;
  if (!live) return;
  await stopGps();
  buffer = [];
  deleteTrack(live.driveId);
  persistLive(null);
  useStore.setState({ status: 'idle', fixes: [] });
  await armDetection();
}

export async function resumeDrive(id: string): Promise<void> {
  dismissFinished(id);
  if (useStore.getState().live || starting) return;
  const summary = getSummary(id);
  if (!summary || Date.now() - Date.parse(summary.endedAt) > RESUME_WINDOW_MS) return;
  if (summary.uploaded) {
    await startRecording(true);
    return;
  }
  const drive = await loadDrive(id);
  if (!drive || useStore.getState().live) return;
  const last = drive.fixes[drive.fixes.length - 1] ?? null;
  await startRecording(false, {
    replaces: id,
    fixes: drive.fixes,
    live: {
      driveId: id,
      startedAt: Date.parse(drive.startedAt),
      manual: false,
      distanceM: drive.distanceM,
      last,
      anchor: last ? { lat: last.lat, lng: last.lng } : null,
      lastMoveAt: Date.now(),
      speedMps: null,
      offAutomotiveSince: null,
    },
  });
}

export async function handleDetectEvent(e: DriveDetectEvent) {
  const live = useStore.getState().live ?? getMeta<Live>(LIVE_KEY);
  if (e.type === 'start') {
    if (live) {
      if (live.offAutomotiveSince != null) persistLive({ ...live, offAutomotiveSince: null });
      return;
    }
    if (settings().autoDetect) await startRecording(false);
    else await stopService();
  } else if (e.type === 'stop') {
    if (live && live.offAutomotiveSince == null) persistLive({ ...live, offAutomotiveSince: e.t || Date.now() });
    if (live) await checkStop();
    else await armDetection();
  } else if (live) {
    await checkStop();
  } else if (settings().autoDetect && nativeDriving()) {
    await startRecording(false);
  } else {
    iosWatchUntil = Date.now() + IOS_WATCH_MS;
    await armDetection();
  }
}

let fastStreak = 0;
let iosWatchUntil = 0;

export async function handleWatch(locations: Location.LocationObject[]) {
  if (useStore.getState().live || !settings().autoDetect) return;
  const waitingSince = getMeta<number>(WAITING_KEY);
  if (waitingSince != null) {
    if (Date.now() - waitingSince > WAITING_MAX_MS || !nativeDriving()) {
      await stopService();
      await armDetection();
      return;
    }
    DriveDetect?.updateRecordingService(s('waitingTitle'), s('waitingBody')).catch(() => undefined);
  }
  if (Platform.OS === 'ios' && Date.now() > iosWatchUntil) {
    await stopWatch();
    return;
  }
  for (const l of locations) {
    const speed = saneSpeed(l.coords.speed, null) ?? -1;
    fastStreak = speed >= FALLBACK_START_MPS && (l.coords.accuracy ?? 0) <= 100 ? fastStreak + 1 : 0;
  }
  if (fastStreak >= 3) {
    fastStreak = 0;
    await startRecording(false).catch(() => undefined);
  }
}

async function startWatch() {
  if (await Location.hasStartedLocationUpdatesAsync(WATCH_TASK).catch(() => false)) return;
  await Location.startLocationUpdatesAsync(WATCH_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15_000,
    distanceInterval: 50,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
  });
}

async function stopWatch() {
  if (await Location.hasStartedLocationUpdatesAsync(WATCH_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(WATCH_TASK).catch(() => undefined);
  }
}

async function readPermissions(): Promise<Permissions> {
  const [fg, bg, notif, motion] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync().catch(() => null),
    Notifications.getPermissionsAsync(),
    hasModule() ? DriveDetect!.getPermissionStatus().catch(() => null) : Promise.resolve(null),
  ]);
  // Android reports a never-asked permission as denied with canAskAgain; only a final denial is 'denied'.
  const askable = (p: { status: string; canAskAgain?: boolean } | null) => !p || p.status === 'undetermined' || p.canAskAgain !== false;
  const location: Permissions['location'] = fg.granted ? (bg?.granted ? 'granted' : 'foreground') : askable(fg) ? 'undetermined' : 'denied';
  return {
    location,
    motion: hasModule() ? (motion?.status === 'granted' ? 'granted' : askable(motion) ? 'undetermined' : 'denied') : 'unavailable',
    notifications: notif.granted ? 'granted' : askable(notif) ? 'undetermined' : 'denied',
  };
}

export async function refreshPermissions(): Promise<Permissions> {
  const permissions = await readPermissions().catch(() => useStore.getState().permissions);
  useStore.setState({ permissions });
  return permissions;
}

let arming: Promise<void> | null = null;

export function armDetection(): Promise<void> {
  if (!arming) {
    arming = doArm()
      .catch(() => undefined)
      .finally(() => {
        arming = null;
      });
  }
  return arming;
}

async function doArm() {
  const p = await refreshPermissions();
  const auto = settings().autoDetect;
  const motionOk = p.motion === 'granted';
  const useModule = auto && hasModule() && (motionOk || (Platform.OS === 'ios' && p.location === 'granted'));
  if (useModule) await DriveDetect!.start(DRIVE_TASK);
  else if (DriveDetect) await DriveDetect.stop(DRIVE_TASK).catch(() => undefined);
  const live = useStore.getState().live;
  const stillDriving = useModule && nativeDriving();
  if (!live && getMeta<number>(WAITING_KEY) != null && (!stillDriving || !auto)) await stopService();
  let watch = auto && (!motionOk || stillDriving) && p.location === 'granted' && !live;
  if (watch && Platform.OS === 'ios') {
    if (AppState.currentState === 'active') iosWatchUntil = Date.now() + IOS_WATCH_MS;
    watch = Date.now() < iosWatchUntil;
  }
  if (watch) await startWatch();
  else await stopWatch();
}

// The Android recording notification is only visible with POST_NOTIFICATIONS (Android 13+).
async function ensureAndroidNotifications() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  const current = await Notifications.getPermissionsAsync().catch(() => null);
  if (!current || current.granted || current.canAskAgain === false) return;
  await Notifications.requestPermissionsAsync().catch(() => undefined);
  await setupNotifications();
}

export async function setAutoDetect(on: boolean): Promise<void> {
  useSettings.getState().set({ autoDetect: on });
  if (on) await ensureAndroidNotifications();
  await armDetection();
}

export async function requestPermissions(kind: 'location-foreground' | 'location-always' | 'motion' | 'notifications'): Promise<Permissions> {
  if (kind === 'location-foreground') {
    await Location.requestForegroundPermissionsAsync();
  } else if (kind === 'location-always') {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.granted) await Location.requestBackgroundPermissionsAsync();
  } else if (kind === 'motion') {
    if (hasModule()) await DriveDetect!.requestPermission();
  } else {
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    await setupNotifications();
  }
  await armDetection();
  return useStore.getState().permissions;
}

export async function restoreRecording() {
  const live = getMeta<Live>(LIVE_KEY);
  if (!live) {
    if (useStore.getState().status === 'idle') await stopGpsTask();
    return;
  }
  if (useStore.getState().live?.driveId !== live.driveId) {
    buffer = [];
    recent = [];
    useStore.setState({
      status: 'recording',
      live: { ...live, anchor: live.anchor ?? null },
      fixes: readTrack(live.driveId).filter((f) => f.acc == null || f.acc <= MAX_ACCURACY_M),
    });
  }
  await checkStop();
  if (!useStore.getState().live) return;
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.granted) await startGps().catch(() => undefined);
}

let ticker: ReturnType<typeof setInterval> | null = null;

// Boot never prompts: detection is only re-armed after onboarding, when the permissions it needs were
// already granted from the disclosure flow (status reads only).
async function armIfReady() {
  if (!settings().onboarded || !settings().autoDetect) return;
  const p = await refreshPermissions();
  if (p.location === 'granted' || p.motion === 'granted') await armDetection();
}

export function bootRecorder() {
  restoreRecording()
    .then(armIfReady)
    .catch(() => undefined);
  setupNotifications();
  Notifications.addNotificationResponseReceivedListener((r) => {
    handleNotificationResponse(r).catch(() => undefined);
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'background') flush();
    if (state === 'active') {
      armIfReady();
      checkStop();
      syncPending().catch(() => undefined);
    }
  });
  useStore.subscribe((st) => {
    if (st.status === 'recording' && !ticker) {
      ticker = setInterval(() => {
        const live = useStore.getState().live;
        if (live) updateNotice(live, true);
        checkStop();
      }, 30_000);
    }
    if (st.status !== 'recording' && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  });
  if (allDrives().length) syncPending().catch(() => undefined);
}

const handled = new Set<string>();

async function handleNotificationResponse(r: Notifications.NotificationResponse) {
  const key = `${r.notification.request.identifier}:${r.actionIdentifier}:${r.notification.date}`;
  if (handled.has(key)) return;
  handled.add(key);
  const data = r.notification.request.content.data as { driveId?: string; url?: string } | undefined;
  if (!data?.driveId) return;
  if (r.actionIdentifier === ACTION_STILL_DRIVING) {
    await resumeDrive(data.driveId);
    return;
  }
  dismissFinished(data.driveId);
  if (r.actionIdentifier === ACTION_DONE || !data.url) return;
  const { router } = await import('expo-router');
  router.push(data.url as never);
}

export function useDriveNotifications() {
  useEffect(() => {
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      handleNotificationResponse(last).catch(() => undefined);
      Notifications.clearLastNotificationResponse();
    }
  }, []);
}

export function useRecorder(): RecorderState {
  const status = useStore((st) => st.status);
  const live = useStore((st) => st.live);
  const autoDetect = useSettings((st) => st.autoDetect);
  if (status === 'finishing' && live) return { status: 'finishing', driveId: live.driveId };
  if (status === 'recording' && live) {
    return {
      status: 'recording',
      driveId: live.driveId,
      startedAt: new Date(live.startedAt).toISOString(),
      distanceM: Math.round(live.distanceM),
      speedMps: live.speedMps,
      manual: live.manual,
    };
  }
  return { status: 'idle', autoDetect };
}

export function usePermissions(): Permissions {
  const permissions = useStore((st) => st.permissions);
  useEffect(() => {
    refreshPermissions();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermissions();
    });
    return () => sub.remove();
  }, []);
  return permissions;
}

export type AutoDetectIssue = 'location-always' | 'motion' | null;

/**
 * What keeps automatic recording from working, for a hint in the UI. Android needs "Physical activity"
 * to start recording from the background; iOS works without Motion & Fitness, but less reliably.
 */
export function useAutoDetectIssue(): AutoDetectIssue {
  const p = usePermissions();
  const autoDetect = useSettings((st) => st.autoDetect);
  if (!autoDetect) return null;
  if (p.location !== 'granted') return 'location-always';
  if (p.motion !== 'granted' && p.motion !== 'unavailable') return 'motion';
  if (p.motion === 'unavailable' && Platform.OS === 'android') return 'motion';
  return null;
}

export function useLiveFixes(): Fix[] {
  return useStore((st) => st.fixes);
}
