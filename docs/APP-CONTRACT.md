# App module contract (core <-> UI)

Two people build the app in parallel. The **core** owner writes everything below; the **UI** owner only imports these exports and never edits these files. Types live in `app/src/core/types.ts` (shared, change only by agreement).

## Ownership
- core: `app/src/core/**` (except types.ts is shared), `app/src/tracking/**`, `app/src/data/**`, `app/src/api/**`, `app/modules/drive-detect/**`, `app/scripts/*.test.ts`, `app/index.ts`, native config in `app/app.config.ts`.
- UI: `app/src/app/**` (expo-router routes), `app/src/components/**`, `app/src/theme/**`, `app/src/i18n/**`, `app/src/ui-lib/**`, `app/assets/**` (except `assets/data/cars.json`, made by the website/data owner).

## `@/core/metrics`
- `computeMetrics(fixes: Fix[]): { metrics: DriveMetrics; events: DriveEvent[] }`
- `simplify(fixes: Fix[], toleranceM: number): [number, number][]` -> [lat, lng] for previews
- `cellsFor(fixes: Fix[]): string[]` (H3 res 9, travel order, deduped)

## `@/core/format`
- `formatDistance(m, units)`, `formatDuration(s)`, `formatSpeed(mps, units)`, `formatElevation(m, units)`, `units: 'metric' | 'imperial'`

## `@/data/drives`
- `useDrives(): DriveSummary[]` (newest first, live updating)
- `useDrive(id): Drive | null` (loads fixes from file)
- `useLifetimeStats(range?: { from?: Date; to?: Date }): LifetimeStats`
- `deleteDrive(id): Promise<void>`
- `useMonthlyRecap(month: string /* YYYY-MM */): { stats: LifetimeStats; topDay: string | null; cellsClaimed: number; drives: DriveSummary[] }`
- `seedDemoData(): Promise<void>` (screenshots / dev only, realistic drives in Munich, Stuttgart and the Alps)

## `@/tracking/recorder`
- `useRecorder(): RecorderState`
- `startManual(): Promise<void>`, `stopManual(): Promise<void>`, `discardCurrent(): Promise<void>`
- `setAutoDetect(on: boolean): Promise<void>`
- `usePermissions(): Permissions` and `requestPermissions(kind: 'location-foreground' | 'location-always' | 'motion' | 'notifications'): Promise<Permissions>`
- `useLiveFixes(): Fix[]` (current drive, for the live map)
- The finished drive opens `/drive/<id>?fresh=1` via the "Drive finished" notification and via `onDriveFinished(cb)`.

## `@/api` (server client, see docs/API.md)
- `api` object with one typed function per endpoint, e.g. `api.me()`, `api.updateMe(patch)`, `api.leaderboard({metric, scope, period, clubId})`, `api.cells(bbox, clubId?)`, `api.createMod(form)`, ...
- `useSession(): { me: Me | null; ready: boolean; offline: boolean; refresh(): Promise<void> }` (creates the anonymous account on first launch unless local-only)
- `useQuery<T>(key: string, fn: () => Promise<T>, deps?)`: tiny SWR-style hook `{ data, error, loading, reload }`
- `syncPending(): Promise<void>` uploads drives not yet uploaded (respects privacy.localOnly)
- `API_URL` from `process.env.EXPO_PUBLIC_API_URL ?? 'https://roadclaim-api.codext.de'`

## `@/data/settings`
- zustand store `useSettings` with `{ units, autoDetect, stopAfterMin, theme: 'system'|'dark'|'light', cardStyle, onboarded, activeCarId, cars: GarageCar[] }` persisted synchronously (expo-sqlite kv-store sync API; async hydration gave a blank screen on Android before).
- `GarageCar = { id: string; catalogId: string; make: string; model: string; year?: number; color: string; nickname?: string; photoUri?: string }`

## `@/data/cars`
- `searchCars(q: string): CatalogCar[]`, `getCar(id): CatalogCar | null`, `CatalogCar = { id, make, model, years: [from, to|null], body: string }` reading `assets/data/cars.json`.
