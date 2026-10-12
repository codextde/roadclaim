# Roadclaim API v1

Base URL: `https://roadclaim-api.codext.de` (self-hosters: your own). JSON in and out. Auth: `Authorization: Bearer <token>`.
Errors: `{ "error": { "code": "string", "message": "string" } }` with a matching HTTP status.
Times are ISO 8601 strings (UTC). Distances in metres, durations in seconds, speeds in m/s.

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
- `GET /v1/config` -> `{ features: { aiMods: boolean }, modsPerDay: number, h3Resolution: 9, season: "2026" }`

## Auth
- `POST /v1/auth/device` `{ platform: "ios"|"android", locale?: string }` -> `{ token: string, recoveryKey: string, me: Me }`
  Creates an anonymous account with a generated username (`driver1234`). The recovery key is shown once in onboarding and in Settings.
- `POST /v1/auth/restore` `{ recoveryKey }` -> `{ token, me }` (rotates the token; old tokens stay valid)
- `GET /v1/auth/recovery-key` -> `{ recoveryKey }` (auth)
- `POST /v1/auth/delete-with-recovery` `{ recoveryKey }` -> `{ ok: true }` (used by the website deletion page)

## Me
- `GET /v1/me` -> `Me`
- `PATCH /v1/me` `{ username?, displayName?, avatarColor?, car?: {id,label,color?}|null, homeCity?, homeCountry?, privacy?: Partial<Me["privacy"]> }` -> `Me`
  username: 3-20 chars `[a-z0-9_.]`, unique (409 `username_taken`).
- `DELETE /v1/me` -> `{ ok: true }` deletes everything.
- `GET /v1/me/stats?period=season` -> `{ distanceM, drives, longestM, cellsHeld, cellsEver, trophies, activeDays, elevationGainM, durationS, countries }`

## Drives
- `POST /v1/drives` `DriveUpload` -> `{ territory: TerritoryResult, newTrophies: Trophy[] }`. Idempotent by id. 403 `local_only` when privacy.localOnly. Validation: avg speed <= 70 m/s, cells.length <= distanceM/100 + 20.
- `DELETE /v1/drives/:id` -> `{ ok: true }` (removes it from stats; territory stays)
- Backup (only when privacy.cloudBackup): `PUT /v1/backup/drives/:id` body = drive JSON (any shape, <= 5 MB) -> `{ ok }`; `GET /v1/backup/drives` -> `{ items: { id, updatedAt, size }[] }`; `GET /v1/backup/drives/:id` -> stored JSON; `DELETE /v1/backup/drives/:id`.

## Users and friends
- `GET /v1/users/search?q=` -> `{ items: PublicUser[] }` (prefix match on username/displayName, max 20)
- `GET /v1/users/:id` -> `{ user: PublicUser, stats: <me/stats shape for season>, trophies: Trophy[], isFriend: boolean, requestPending: "in"|"out"|null }`
- `GET /v1/friends` -> `{ items: PublicUser[] }`
- `GET /v1/friends/requests` -> `{ incoming: {id, user: PublicUser, createdAt}[], outgoing: {id, user, createdAt}[] }`
- `POST /v1/friends/requests` `{ userId }` -> `{ id }` (auto-accepts when the other side already requested)
- `POST /v1/friends/requests/:id/accept` / `.../decline` -> `{ ok }`
- `POST /v1/friends/invite/:code` -> `{ friend: PublicUser }` (instant friendship via invite link)
- `DELETE /v1/friends/:userId` -> `{ ok }`
- `GET /v1/compare/:userId` -> `{ me: Stats, them: Stats, user: PublicUser }` (season stats, seven measures)

## Leaderboards
- `GET /v1/leaderboards?metric=&scope=&period=&clubId=` -> `{ entries: BoardEntry[] (top 100), me: BoardEntry | null, scopeLabel: string }`
  city/country use the caller's homeCity/homeCountry (else the city of their latest drive). `area` ignores period for held cells and uses cells claimed in the period that are still held.
- `GET /v1/leaderboards/clubs?metric=area|distance&period=` -> `{ entries: { rank, club: Club, value }[] }`

## Territory
- `GET /v1/territory/cells?bbox=minLat,minLng,maxLat,maxLng&clubId=` -> `{ cells: CellOwner[] }` (max 5,000; bbox larger than ~0.6 deg returns 413 `zoom_in`)
- `GET /v1/territory/mine` -> `{ held: string[], ever: string[] }`
- `GET /v1/territory/season?board=overall|stealers|gainers|losers&month=YYYY-MM&scope=world|friends` -> `{ entries: BoardEntry[], me: BoardEntry | null }`

## Clubs
- `POST /v1/clubs` `{ name, color, description?, isPublic }` -> `Club` (leaves the previous club)
- `GET /v1/clubs/mine` -> `{ club: Club | null }`
- `GET /v1/clubs/search?q=` -> `{ items: Club[] }` (public clubs)
- `GET /v1/clubs/:id` -> `{ club: Club, members: { user: PublicUser, role: "owner"|"member", distanceM: number }[] }`
- `POST /v1/clubs/join` `{ code }` or `POST /v1/clubs/:id/join` (public) -> `Club`
- `POST /v1/clubs/:id/leave` -> `{ ok }`; `DELETE /v1/clubs/:id/members/:userId` (owner); `DELETE /v1/clubs/:id` (owner); `PATCH /v1/clubs/:id` (owner)

## Trophies
- `GET /v1/trophies` -> `{ items: Trophy[] }` (all definitions with my progress)

## AI car mods
- `POST /v1/mods` multipart: `style` (preset id or "custom"), `prompt?`, `carLabel`, `color?`, `photo?` (jpeg/png <= 8 MB) -> `{ id, imageUrl, createdAt }` (429 `limit_reached`, 503 `disabled`)
- `GET /v1/mods` -> `{ items: { id, style, prompt, carLabel, imageUrl, createdAt }[], remainingToday: number }`
- `GET /v1/mods/:id/image` -> image/png (the URL carries a signed `?sig=` so `<Image>` can load it without headers)
- `DELETE /v1/mods/:id`

## Web
- `GET /i/:code` on the website redirects to `roadclaim://i/<code>` with a store fallback page.
