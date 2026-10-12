# drive-detect

Local Expo module that notices when a drive starts and ends, so Roadclaim records without a tap.

JS API (`modules/drive-detect/index.ts`): `isAvailable()`, `getPermissionStatus()`, `requestPermission()`, `start(taskName)`, `stop(taskName)`, `getCurrentActivity()`, events `onDriveStart`, `onDriveStop`, `onActivity`, and on Android `startRecordingService(title, body)`, `updateRecordingService(title, body)`, `stopRecordingService()` (no-ops on iOS).

`start(taskName)` registers a task consumer with expo-task-manager. Detection events (`{ type: 'start' | 'stop' | 'wake', t }`) are delivered to the JS task defined with `TaskManager.defineTask(taskName, ...)` in `src/tracking/background.ts`. Using the task manager means events reach JS even when the app was not running: expo-task-manager persists the task, restores the consumer at launch and queues events until the JS runtime is up.

## iOS

- `CMMotionActivityManager` activity updates: automotive with medium or high confidence starts a drive; walking, running, cycling or stationary without automotive (medium or high confidence) stops it.
- `startMonitoringSignificantLocationChanges` (needs "Always"): iOS relaunches a terminated app in the background for these. On each change the module queries the last ten minutes of motion activity and emits a `wake` event.
- Background relaunch under the UIScene life cycle: React Native normally starts only when a window scene connects, which never happens on a background location launch. `DriveDetectAppDelegateSubscriber` starts the React host without a surface when the app is launched with `UIApplication.LaunchOptionsKey.location`; the scene reuses that host when the user opens the app.
- Without Motion & Fitness the JS side falls back to a speed heuristic on a low-power location watch that only runs for five minutes after a `wake` event or after the app came to the foreground, to save battery.
- Recording itself uses expo-location (`AutomotiveNavigation`, `pausesUpdatesAutomatically: false`, `showsBackgroundLocationIndicator: true`).

## Android

- Activity Recognition Transition API (`IN_VEHICLE` enter and exit, `play-services-location`). The PendingIntent targets expo-task-manager's manifest-registered `TaskBroadcastReceiver`, which restores `DriveDetectTaskConsumer` even when the process was dead. The same receiver handles `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED`, so the transitions are re-registered after a reboot or an update.
- On enter the consumer persists the event and immediately starts `DriveService`, a foreground service of type `location` with the notification "Recording your drive". Activity transition broadcasts are an allowed exemption for starting a foreground service from the background (Android 12+), and the service is only started when location and `ACCESS_BACKGROUND_LOCATION` are granted, which Android 14 requires for a background-started location service. Then it runs the JS task headlessly; JS starts expo-location background updates (without expo-location's own foreground service, which refuses to start from the background) and keeps the notification text current with the driven distance.
- `DriveService` keeps the process in the foreground state, so the location updates are not throttled. It stops itself if JS has not refreshed it for four minutes, so a JS failure never leaves a stray notification.
- `startRecordingService` resolves `true` only once the service really runs in the foreground (Android 12+ can refuse a background start); without it JS does not start a throttled background recording.
- When a drive ends on the idle rule while activity recognition still reports `IN_VEHICLE`, the service stays up in a waiting state ("Paused while you are stopped") and a low-power location watch starts the next leg from it, because a new foreground service could not be started from the background. It ends on `IN_VEHICLE` exit or after 30 minutes.
- Without background location, manual recordings use expo-location's own foreground service while the app is open.

Why not a plain headless JS task (`HeadlessJsTaskService`) or launching expo-location's service directly: expo-task-manager already owns headless JS loading for location tasks (and keeps JS timers alive while a task runs), while expo-location's service can only be started from the foreground and is bound to its task consumer.
