# App module contract (core <-> UI)

Two people build the app in parallel. The **core** owner writes everything below; the **UI** owner only imports these exports and never edits these files. Types live in `app/src/core/types.ts` (shared, change only by agreement).

## Ownership
- core: `app/src/core/**` (except types.ts is shared), `app/src/tracking/**`, `app/src/data/**`, `app/src/api/**`, `app/modules/drive-detect/**`, `app/scripts/*.test.ts`, `app/index.ts`, native config in `app/app.config.ts`.
- UI: `app/src/app/**` (expo-router routes), `app/src/components/**`, `app/src/theme/**`, `app/src/i18n/**`, `app/src/ui-lib/**`, `app/assets/**` (except `assets/data/cars.json`, made by the website/data owner).

## `@/core/metrics`
- `computeMetrics(fixes: Fix[]): { metrics: DriveMetrics; events: DriveEvent[] }`
- `simplify(fixes: Fix[], toleranceM: number): [number, number][]` -> [lat, lng] for previews
- `cellsFor(fixes: Fix[]): string[]` (H3 res 9, travel order, deduped)
- Units: `Fix.t` is epoch milliseconds, speeds m/s, `steepestClimbPct` and `steepestDescentPct` are both positive percentages (null without altitude or under 500 m). `DriveEvent.value`: brake = peak deceleration m/s2, turn = degrees, stop = seconds.
- Extras: `filterFixes(fixes)`, `trimStationary(fixes)`

## `@/core/format`
- `formatDistance(m, units)`, `formatDuration(s)`, `formatSpeed(mps, units)`, `formatElevation(m, units)`, `units: 'metric' | 'imperial'` (type `Units`)
- Extras: `distanceParts(m, units): { value, unit }` (for big numerals), `formatClock(s)` (`1:02:05`), `formatPercent(x)`

## `@/data/drives`
- `useDrives(): DriveSummary[]` (newest first, live updating)
- `useDrive(id: string | null | undefined): Drive | null` (loads fixes from file)
- `useLifetimeStats(range?: { from?: Date; to?: Date }): LifetimeStats`
- `deleteDrive(id): Promise<void>`
- `useMonthlyRecap(month: string /* YYYY-MM */): { stats: LifetimeStats; topDay: string | null; cellsClaimed: number; drives: DriveSummary[] }`
- `seedDemoData(): Promise<void>` (screenshots / dev only, realistic drives in Munich, Stuttgart and the Alps; shown as uploaded with territory, never synced)
- `loadSampleDrives(): Promise<void>`, `removeSampleDrives(): Promise<void>`, `useHasSampleDrives(): boolean`: same tracks flagged `sample: true` (`DriveSummary.sample`), never uploaded or synced, removable in one call (for store reviewers who cannot drive)

## `@/tracking/recorder`
- `useRecorder(): RecorderState`
- `startManual(): Promise<void>`, `stopManual(): Promise<void>`, `discardCurrent(): Promise<void>`
- `setAutoDetect(on: boolean): Promise<void>`
- `usePermissions(): Permissions` and `requestPermissions(kind: 'location-foreground' | 'location-always' | 'motion' | 'notifications'): Promise<Permissions>`
- `useLiveFixes(): Fix[]` (current drive, for the live map)
- The finished drive opens `/drive/<id>?fresh=1` via the "Drive finished" notification and via `onDriveFinished(cb: (driveId: string) => void): () => void` (fires for every saved drive; the notification is only posted when the app is not in the foreground).
- `useDriveNotifications()`: call once in the root layout; routes a notification tap that cold-started the app (warm taps are routed by core). The notification's "Still driving" action reopens the drive (`resumeDrive(id)`), "Done" just dismisses it.
- Permissions: `location: 'granted'` means "Always"; `'foreground'` means only while using the app (manual recording works, auto-detect does not).
- Core never asks for a permission on its own: at launch it only re-arms detection when `onboarded` is true and the permissions are already granted. Call `requestPermissions(...)` / `setAutoDetect(true)` after the user accepts the disclosure.
- `onDriveDiscarded(cb: (d: { driveId, distanceM, durationS, manual }) => void): () => void` fires when a stopped recording was too short to keep (auto: under 500 m or 60 s, manual: under 150 m or 20 s), e.g. for a "Drive too short to save" toast.
- On Android 13+ `startManual()` and `setAutoDetect(true)` also ask for notifications if never asked, so the recording notification is visible. A permission Android reports as denied but still askable shows as `'undetermined'`.
- `useAutoDetectIssue(): 'location-always' | 'motion' | null`: why automatic recording cannot work right now (Android needs "Physical activity" to start in the background), for a hint row; null when auto-detect is off or everything is granted.

## `@/api` (server client, see docs/API.md)
- `api` object with one typed function per endpoint, e.g. `api.me()`, `api.updateMe(patch)`, `api.leaderboard({metric, scope, period, clubId})`, `api.cells(bbox, clubId?)`, `api.createMod(form)`, ... (see `app/src/api/endpoints.ts`; `bbox = { minLat, minLng, maxLat, maxLng }`, `createMod` takes `{ style, prompt?, carLabel, color?, photo?: { uri, type } }` or a FormData)
- Safety: `api.report({ targetType, targetId, reason, note? })`, `api.block(userId)`, `api.unblock(userId)`, `api.blocks()`
- Errors are `ApiError { status, code, message }` (`status` 0 = offline); all API types are exported from `@/api`.
- Session helpers: `updateMe(patch)` (also updates `useSession().me`), `restoreAccount(recoveryKey)`, `getRecoveryKey()`, `deleteAccount()`, `setLocalOnly(on)`, `refreshSession()`; `onNewTrophies(cb)` fires after uploads that earned trophies; `invalidateQuery(prefix)`
- `useSession(): { me: Me | null; ready: boolean; offline: boolean; refresh(): Promise<void> }` (creates the anonymous account on first launch unless local-only)
- `useQuery<T>(key: string, fn: () => Promise<T>, deps?)`: tiny SWR-style hook `{ data, error, loading, reload }`
- `syncPending(): Promise<void>` uploads drives not yet uploaded (respects privacy.localOnly)
- `API_URL` from `process.env.EXPO_PUBLIC_API_URL ?? 'https://roadclaim-api.codext.de'`

## `@/data/settings`
- zustand store `useSettings` with `{ units, autoDetect, stopAfterMin, theme: 'system'|'dark'|'light', cardStyle: 'dark'|'light'|'minimal', onboarded, activeCarId, cars: GarageCar[], localOnly, lastRecapMonth: string | null }` and `set(patch)`; change `autoDetect` through `setAutoDetect` and `localOnly` through `setLocalOnly` so detection and the server follow. Persisted synchronously (expo-sqlite kv-store sync API; async hydration gave a blank screen on Android before).
- `GarageCar = { id: string; catalogId: string; make: string; model: string; year?: number; color: string; nickname?: string; photoUri?: string }`

## `@/data/cars`
- `searchCars(q: string): CatalogCar[]`, `getCar(id): CatalogCar | null`, `CatalogCar = { id, make, model, years: [from, to|null], body: string }` reading `assets/data/cars.json`. Extra: `carLabel({ make, model, year? })`.
