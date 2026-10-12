# Roadclaim API v1

Base URL: `https://roadclaim-api.codext.de` (self-hosters: your own). JSON in and out. Auth: `Authorization: Bearer <token>`.
Errors: `{ "error": { "code": "string", "message": "string" } }` with a matching HTTP status.
Times are ISO 8601 strings (UTC). Distances in metres, durations in seconds, speeds in m/s.
Common errors: 400 `invalid_request` (validation), 401 `unauthorized`, 404 `not_found`, 413 `too_large`, 422 `inappropriate_name`, 429 `rate_limited` (with `Retry-After`).
Rate limits (per server instance; IPv6 clients are grouped by /64): device signup 20/hour per IP, restore and delete-with-recovery 30/hour per IP, drive uploads 120/hour per user, backup uploads 600/hour per user, 600 requests/minute per IP, 300 requests/minute per user.
Name moderation: `username`, `displayName`, `car.label`, `car.color`, `homeCity`, club `name` and `description` are checked against a built-in English and German word list (leetspeak normalised); a match returns 422 `inappropriate_name`.

## Types

```ts
type PublicUser = {
  id: string; username: string; displayName: string;
  avatarColor: string;            // hex, e.g. "#10B981"
  car: { id: string; label: string; color?: string } | null;
  homeCity: string | null; homeCountry: string | null; // ISO 3166-1 alpha-2
  club: { id: string; name: string; color: string } | null;
};
type Me = PublicUser & {
  inviteCode: string;
  privacy: { localOnly: boolean; hideFromLeaderboards: boolean; cloudBackup: boolean };
  createdAt: string;
};
type DriveUpload = {
  id: string;                     // client uuid v4, idempotent
  startedAt: string; endedAt: string;
  distanceM: number; durationS: number; movingS: number;
  maxSpeedMps: number; avgSpeedMps: number;
  elevationGainM: number; elevationLossM: number;
  brakePresses: number; turnsLeft: number; turnsRight: number; laneChanges: number; stops: number;
  city: string | null; countryCode: string | null;
  cells: string[];                // H3 res 9 indexes in travel order, deduped
  utcOffsetMin?: number;          // local UTC offset at start (e.g. 120); else the offset in startedAt, else UTC. Used for night/early-bird trophies and active days
};
type TerritoryResult = { claimed: number; stolen: number; refreshed: number; held: number };
type Trophy = {
  id: string;                     // e.g. "distance_total"
  tier: 0 | 1 | 2 | 3;            // 0 = not earned, 1 bronze, 2 silver, 3 gold
  value: number;                  // current progress value
  next: number | null;            // threshold for the next tier, null when gold
  earnedAt: string | null;
};
type Period = "today" | "week" | "month" | "season";
type Metric = "distance" | "area" | "longest" | "trophies";
type Scope = "friends" | "city" | "country" | "world" | "club";
type BoardEntry = { rank: number; user: PublicUser; value: number };
type Club = { id: string; name: string; color: string; description: string; isPublic: boolean;
  ownerId: string; memberCount: number; cellsHeld: number; inviteCode?: string /* members only */ };
type CellOwner = { cell: string; owner: "me" | "friend" | "club" | "other"; userId: string; name: string; color: string };
```

## Health and config
- `GET /health` -> `{ ok: true }`
- `GET /v1/config` -> `{ features: { aiMods: boolean }, modsPerDay: number, h3Resolution: 9, season: "2026" }` (`modsPerDay` defaults to 3)

## Auth
- `POST /v1/auth/device` `{ platform: "ios"|"android", locale?: string }` -> `{ token: string, recoveryKey: string, me: Me }`
  Creates an anonymous account with a generated username (`driver` + 8 random digits, e.g. `driver04817263`). The recovery key is shown once in onboarding and in Settings.
- `POST /v1/auth/restore` `{ recoveryKey }` -> `{ token, me }` (rotates the token; old tokens stay valid)
- `GET /v1/auth/recovery-key` -> `{ recoveryKey }` (auth)
- `POST /v1/auth/rotate-recovery` -> `{ recoveryKey }` (auth) issues a new recovery key (the old one stops working) and signs out every other device: all tokens except the one used for this call are revoked.
- `POST /v1/auth/delete-with-recovery` `{ recoveryKey }` -> `{ ok: true }` (used by the website deletion page; CORS allows `CORS_ORIGINS`, default `https://roadclaim.codext.de`)
  Recovery keys are accepted case-insensitively with or without the `RC-` prefix and dashes. Unknown keys: 404 `invalid_recovery_key`.

## Me
- `GET /v1/me` -> `Me`
- `PATCH /v1/me` `{ username?, displayName?, avatarColor?, car?: {id,label,color?}|null, homeCity?, homeCountry?, privacy?: Partial<Me["privacy"]> }` -> `Me`
  username: 3-20 chars `[a-z0-9_.]` (lower-cased), unique (409 `username_taken`). displayName 1-40 chars, homeCountry ISO alpha-2.
  Setting `privacy.cloudBackup` to false deletes all stored backups. Setting `privacy.localOnly` to true removes all cells you hold from the map (they become unowned).
- `DELETE /v1/me` -> `{ ok: true }` deletes everything.
- `GET /v1/me/stats?period=season` -> `{ distanceM, drives, longestM, cellsHeld, cellsEver, trophies, activeDays, elevationGainM, durationS, countries }`
  Drive-based values cover drives started in the period; `cellsHeld`/`cellsEver` are current totals; `trophies` = trophy tiers earned in the period.

## Drives
- `POST /v1/drives` `DriveUpload` -> `{ territory: TerritoryResult, newTrophies: Trophy[] }`. Idempotent by id: 201 on first upload, 200 with the stored territory result and `newTrophies: []` on repeats; 409 `drive_exists` when the id belongs to another account. 403 `local_only` when privacy.localOnly. Validation: avg speed <= 70 m/s, max speed <= 90 m/s, movingS <= durationS, distanceM <= maxSpeedMps * movingS * 1.1 + 500, cells.length <= distanceM/100 + 20, every cell a valid H3 res 9 index, consecutive cells at most 20 grid steps apart, total grid steps * 175 m <= distanceM * 1.5 + 1000, endedAt >= startedAt.
- `DELETE /v1/drives/:id` -> `{ ok: true }` (removes it from stats; territory stays)
- Backup (only when privacy.cloudBackup, else 403 `backup_disabled`): `PUT /v1/backup/drives/:id` (`id`: `[A-Za-z0-9_-]{1,64}`) body = drive JSON (any shape, <= 5 MB, 413 above) -> `{ ok }`; quota per account: 2,000 backups and 500 MB in total (413 `quota_exceeded`, replacing an existing id counts its new size only); `GET /v1/backup/drives` -> `{ items: { id, updatedAt, size }[] }`; `GET /v1/backup/drives/:id` -> stored JSON; `DELETE /v1/backup/drives/:id`.

## Users and friends
- `GET /v1/users/search?q=` -> `{ items: PublicUser[] }` (prefix match on username/displayName, max 20; excludes yourself, local-only and blocked users)
- `GET /v1/users/:id` -> `{ user: PublicUser, stats: <me/stats shape for season>, trophies: Trophy[], isFriend: boolean, requestPending: "in"|"out"|null }` (404 for local-only users and when either side blocked the other, except for yourself)
- `GET /v1/friends` -> `{ items: PublicUser[] }`
- `GET /v1/friends/requests` -> `{ incoming: {id, user: PublicUser, createdAt}[], outgoing: {id, user, createdAt}[] }`
- `POST /v1/friends/requests` `{ userId }` -> `{ id }` (auto-accepts when the other side already requested; 409 `already_friends`; 403 `blocked` when either side blocked the other)
- `POST /v1/friends/requests/:id/accept` / `.../decline` -> `{ ok }`
- `POST /v1/friends/invite/:code` -> `{ friend: PublicUser }` (instant friendship via invite link; 404 `invalid_invite`, 400 `own_invite`, 403 `blocked`)
- `DELETE /v1/friends/:userId` -> `{ ok }`
- `GET /v1/compare/:userId` -> `{ me: Stats, them: Stats, user: PublicUser }` (season stats, seven measures; same 404 rules as `GET /v1/users/:id`)

## Safety
- `POST /v1/reports` `{ targetType: "user"|"club", targetId, reason: "name"|"spam"|"cheating"|"other", note?: string (<= 1000) }` -> `{ ok: true }` (404 when the target does not exist)
- `POST /v1/blocks` `{ userId }` -> `{ ok: true }` (also removes the friendship and pending requests both ways)
- `DELETE /v1/blocks/:userId` -> `{ ok: true }`
- `GET /v1/blocks` -> `{ items: PublicUser[] }`
- Blocks work in both directions: the two users never see each other in leaderboards, season boards, search, profiles, compare or club member lists; the other user's cells are returned as `owner: "other"` with `name: ""` and a neutral grey colour; neither side can send the other friend requests or use the other's invite link.

## Leaderboards
- `GET /v1/leaderboards?metric=&scope=&period=&clubId=` -> `{ entries: BoardEntry[] (top 100), me: BoardEntry | null, scopeLabel: string }`
  city/country use the caller's homeCity/homeCountry (else the city/country of their latest drive). `area` ignores period for held cells and uses cells claimed in the period that are still held. `trophies` = trophy tiers earned in the period. `club` scope uses `clubId` or the caller's club.
  Periods are UTC calendar ranges: today, week (from Monday), month, season (calendar year). Only users with a value > 0 are ranked; ties share a rank.
  Users with `hideFromLeaderboards` appear only on the friends board (they still see themselves everywhere); `localOnly` users never appear. `me` is the caller's entry (value 0 and rank after the last entry when unranked) or null when the caller is not part of the scope.
  World and club boards are cached for 60 seconds, so new uploads can take up to a minute to show there. A private `clubId` returns 404 for non-members.
- `GET /v1/leaderboards/clubs?metric=area|distance&period=` -> `{ entries: { rank, club: Club, value }[] }` (club values are the sum over current members; private clubs are listed only for their own members; cached for 60 seconds)

## Territory
- `GET /v1/territory/cells?bbox=minLat,minLng,maxLat,maxLng&clubId=` -> `{ cells: CellOwner[] }` (max 5,000; bbox larger than ~0.6 deg returns 413 `zoom_in`)
- `GET /v1/territory/mine` -> `{ held: string[], ever: string[] }`
- `GET /v1/territory/season?board=overall|stealers|gainers|losers&month=YYYY-MM&scope=world|friends` -> `{ entries: BoardEntry[], me: BoardEntry | null }`
  `month` defaults to the current UTC month and must lie between 2026-10 (first season) and the current month (400 `invalid_month`). overall = cells held now (current month) or held at the end of the month (past months); stealers = steals in the month; gainers = claims + steals minus cells lost in the month; losers = cells lost in the month. Same visibility rules as the leaderboards.
- `GET /v1/territory/cells`: `owner` is `me`, `friend`, `club` (owner is in your club) or `other`; `clubId` limits the result to that club's turf (404 for a private club you are not in). Cells of local-only users are never returned. 400 for malformed bboxes.

## Clubs
- `POST /v1/clubs` `{ name (2-40), color (#RRGGBB), description? (<= 280), isPublic }` -> `Club` with status 201 (leaves the previous club)
- `GET /v1/clubs/mine` -> `{ club: Club | null }`
- `GET /v1/clubs/search?q=` -> `{ items: Club[] }` (public clubs)
- `GET /v1/clubs/:id` -> `{ club: Club, members: { user: PublicUser, role: "owner"|"member", distanceM: number | null }[] }` (404 for private clubs unless you are a member). Unless the member is you or your friend: local-only members are left out, members hidden from leaderboards have `distanceM: null`, blocked users are left out.
- `POST /v1/clubs/join` `{ code }` (404 `invalid_invite`) or `POST /v1/clubs/:id/join` (public, else 403 `private_club`) -> `Club`
- `POST /v1/clubs/:id/leave` -> `{ ok }`; `DELETE /v1/clubs/:id/members/:userId` (owner) -> `{ ok }`; `DELETE /v1/clubs/:id` (owner) -> `{ ok }`; `PATCH /v1/clubs/:id` `{ name?, color?, description?, isPublic? }` (owner) -> `Club`. Non-owners get 403 `not_owner`.
- When the owner leaves or deletes their account, ownership passes to the longest-standing member; a club without members is deleted.

## Trophies
- `GET /v1/trophies` -> `{ items: Trophy[] }` (all definitions with my progress)
- `GET /v1/trophies/definitions` (no auth) -> `{ items: { id, unit, tiers: number[], title: { en, de }, description: { en, de } }[] }`
  Ids: `first_drive`, `distance_total` (km), `distance_single` (km), `active_days`, `streak`, `cells_held`, `steals`, `night_drive` (start 00-04 local), `early_bird` (04-06 local), `climber` (m in one drive), `countries`, `club`. Single-threshold trophies (`first_drive`, `club`) top out at tier 1 with `next: null`. Earned tiers never drop. `Trophy.value` and `next` use the definition's unit.

## AI car mods
- `POST /v1/mods` multipart: `style` (`widebody`, `stance`, `rally`, `track`, `matte_wrap`, `chrome_delete`, `offroad`, `retro` or `custom`; custom requires `prompt`), `prompt?` (<= 500), `carLabel`, `color?`, `photo?` (jpeg/png <= 8 MB) -> `{ id, imageUrl, createdAt }` with status 201.
  Errors: 429 `limit_reached` (per-user `MODS_PER_DAY`, default 3), 429 `global_limit` (server-wide `MODS_GLOBAL_PER_DAY`, default 100, per UTC day), 503 `disabled`, 502 `generation_failed` (not counted towards the daily limit), 400 `invalid_photo`, 413 `photo_too_large`.
  Generation attempts, including failed ones, are also capped at 3x the daily limits (per user and server-wide) and never refunded; reaching that cap returns the same 429 codes. Limits are checked before the upload is read.
- `GET /v1/mods` -> `{ items: { id, style, prompt, carLabel, imageUrl, createdAt }[], remainingToday: number }` (`remainingToday` = min(your remaining, server-wide remaining), including the attempt caps)
- `GET /v1/mods/:id/image` -> image/png or image/jpeg with `X-Content-Type-Options: nosniff` (the URL carries a signed `?sig=` so `<Image>` can load it without headers). Only PNG and JPEG output is stored.
- `DELETE /v1/mods/:id` -> `{ ok: true }` (deleting does not give back the daily allowance)

## Web
- `GET /i/:code` on the website redirects to `roadclaim://i/<code>` with a store fallback page.
