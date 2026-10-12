# Roadclaim - product spec

Roadclaim is a free, open-source drive tracker. It records the drives you already take without a tap, turns each one into numbers nobody else counts, and lets you claim the map hexagon by hexagon against friends, your city, your country and the world.

Feature parity target: Enroad (formerly TripRank). Never use their name, assets or texts.

Platforms: iOS 16+ and Android 8+ (Expo SDK 57, React Native 0.86). Server: Bun + Hono + Postgres on Coolify v4. Everything is free.

## 1. Recording

- **Automatic detection.** You never press start. iOS: a local Expo module `drive-detect` uses `CMMotionActivityManager` (automotive with medium/high confidence) plus significant location changes to wake the app; Android: Activity Recognition Transition API (`IN_VEHICLE` enter/exit) with a BroadcastReceiver. When driving is detected, the JS recorder starts high-accuracy background location (expo-location + TaskManager, Android foreground service with a persistent notification "Recording your drive").
- Fallback when the module or permission is missing: speed heuristic on low-power background updates (>= 20 km/h for 3 consecutive fixes).
- **Manual start/stop** button on the home screen for users who don't grant "Always".
- **Stop:** after 4 minutes below 5 km/h (configurable 2-10 min), or when motion activity leaves automotive for 3 minutes. A local notification asks "Drive finished?" with actions Done / Still driving; if ignored the drive is closed automatically.
- Drives shorter than 500 m or 60 s are discarded.
- Each drive is stored on device as its own JSON file (`drives/<id>.json`, points: t, lat, lng, alt, speed, heading, accuracy) and indexed in SQLite (expo-sqlite).
- Points are filtered: accuracy > 50 m dropped, teleports (> 70 m/s implied) dropped.

## 2. Metrics per drive (computed on device, pure TS in `app/src/core/metrics.ts`, unit tested)

- Distance (haversine over filtered points), duration, moving time, stopped time (speed < 1.5 m/s for >= 10 s), number of stops (stopped segments >= 10 s), max speed, average speed (distance / moving time).
- Elevation: total gain and loss with 3 m hysteresis on smoothed altitude; highest point; steepest climb and steepest descent as grade over a 500 m window.
- Turns: left and right turn counts (heading change >= 60 deg within <= 60 m of travel at speed >= 3 m/s, debounced).
- Brake presses: each deceleration event below -1.2 m/s2 (speed derivative, smoothed), debounced 3 s.
- Lane changes: lateral S-pattern at >= 50 km/h: heading deviates 2-12 deg one way then returns within 3-8 s with net heading change < 3 deg.
- Max g-force (longitudinal from speed derivative, lateral from v * yaw rate), hardest acceleration.
- Visited H3 cells at resolution 9 (`h3-js`), deduped in order. Only these cell ids ever leave the phone, never coordinates.
- Start/end place names by OS reverse geocoding (city, country code).

## 3. Lifetime stats

All-time distance, drives, active days, hours driving, longest drive, total elevation, brake presses, turns, cells ever held. Season (calendar year) stats. Monthly recap card (distance, drives, top day, cells claimed, new trophies) generated on the first open of a new month and on demand.

## 4. Share cards

- When a drive ends, the summary screen shows a share card: route sketch, distance, total time, location and date. Toggle "Detailed" adds brake presses, turns, stops, lane changes, stopped time and elevation.
- Rendered with react-native-view-shot, shared with expo-sharing or saved to Photos (expo-media-library). Several card styles (dark map, light, minimal). Square and story (9:16) formats.

## 5. Ride Replay

Re-drive any recorded route over 3D satellite imagery from a chase camera in about thirty seconds: react-native-maps (Apple Maps `satelliteFlyover` on iOS, Google Maps `hybrid` on Android) with camera pitch 60, heading = route bearing, animated along a resampled route. Scrubber to jump anywhere, speed 0.25x / 0.5x / 1x / 2x, live distance and elapsed time overlay. Route polyline drawn as it progresses.

## 6. Leaderboards

- Metrics: Distance, Area held (cells currently held), Longest ride, Trophies.
- Scopes: Friends, City, Country, Worldwide, Clubs (my club's members) and a club-vs-club board.
- Periods: Today, Week, Month, Season (calendar year, labelled "2026 Season").
- Head-to-head: compare season stats with a friend across seven measures (distance, drives, longest ride, area held, trophies, active days, elevation gain).
- Public profile: display name, username, avatar, car, home city, season stats, trophies.

## 7. Territory

- The world is a shared H3 resolution-9 hexagon grid (~300 m across).
- Each uploaded drive claims every cell it passes through. Unowned cell = claimed, cell owned by someone else = stolen, own cell = refreshed.
- My Map: every hex you have ever held (all time), and what you hold now.
- Map view shows cells in the visible region coloured: mine (emerald), friends (blue), my club (amber), others (grey/red).
- Monthly seasons with boards: Overall (cells held), Top Stealers, Top Gainers (net), Top Losers.
- Clubs: every member's drives count toward the club's shared turf; club map.

## 8. Clubs

Create (name, colour, emoji, description, public/private), join by invite code/link or search for public clubs, leave, owner can remove members and delete. One active club per user. Club page: members, club turf count, club leaderboard.

## 9. Friends

Invite link (`https://roadclaim.codext.de/i/<code>` and `roadclaim://i/<code>`) adds a friend at once; search by username; friend requests (accept / decline); remove friend.

## 10. Garage and AI car mods

- Pick your car from a bundled catalogue of 1,000+ makes/models (`app/assets/data/cars.json`, generated from public data), with year and colour. Shown on your profile and leaderboard rows. Multiple cars, one active.
- AI car mods: pick a style preset (widebody, stance, rally, track, matte wrap, chrome delete, off-road, retro) or type your own idea, optionally start from a photo of your car; the server generates the modded image with Google's Gemini image model. Gallery of your mods, save/share. Daily limit per user (server env `MODS_PER_DAY`, default 10). Hidden when the server has no `GEMINI_API_KEY`.

## 11. Trophies

Tiered trophies (bronze, silver, gold) evaluated on the server after each upload, shown on profile with progress. Examples: first drive; total distance 100 / 1,000 / 10,000 km; single drive 100 / 300 / 800 km; active days 7 / 30 / 100; streak 3 / 7 / 30 days; cells held 100 / 1,000 / 10,000; steals 1 / 50 / 500; night drive (00-04); early bird (04-06); climber (elevation gain in one drive 500 / 1,500 / 3,000 m); countries visited 2 / 5 / 10; clubs (join one).

## 12. Privacy and account

- No sign-up form: an anonymous account is created on first launch. Username and display name are chosen in onboarding.
- Recovery key (shown in Settings, copyable) restores the account on a new phone.
- Keep everything on this device: no uploads at all (drives, territory, leaderboards off).
- Hide from leaderboards: friends still see you.
- Cloud backup of full drives (optional, off by default).
- Delete account in Settings (and on the website with the recovery key): deletes profile, drives, cells, club ownership, mods.
- No ads, no tracking SDKs, no analytics.

## 13. Safety

Onboarding and store texts: never touch the phone while driving, the app needs no interaction while driving, follow the speed limit; no speed leaderboard on purpose.

## 14. UX

Dark-first 2026 style (light supported): deep graphite backgrounds, emerald accent (#10B981), large tabular numerals, smooth haptics, no emoji, no AI slop. Tabs: Drives, Map, Ranks, Garage, Profile. English and German.
