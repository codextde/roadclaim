# Roadclaim

**Every drive counts. Claim the map.**

Roadclaim is a free, open-source drive tracker for iPhone and Android. It records the drives you already take without a tap, turns each one into numbers nobody else counts, and lets you claim the map hexagon by hexagon against friends, your city, your country and the world.

Free, no ads, no tracking. Made by [Codext GmbH](https://roadclaim.codext.de/imprint/).

Website: [roadclaim.codext.de](https://roadclaim.codext.de)

## Features

- **Automatic recording.** Drives start and stop on their own using motion activity and location. Manual start and stop too.
- **Stats nobody else counts.** Brake presses, left and right turns, lane changes, stops, elevation gain and loss, steepest grade, peak g-force, plus distance, time and speeds.
- **Lifetime and season stats** with a monthly recap.
- **Share cards** in several styles, square and story format, with an optional detailed view.
- **Ride Replay.** Re-drive any route over 3D satellite imagery from a chase camera in about thirty seconds.
- **Leaderboards** for distance, area held, longest ride and trophies, across friends, city, country, worldwide and clubs, for today, week, month and season. Head-to-head with friends.
- **Territory.** The world is an H3 hexagon grid (cells about 300 m across). Every drive claims, steals or refreshes the cells it passes. Monthly seasons with boards for most held, top stealers and top gainers.
- **Clubs** with a shared turf, club leaderboards and club-vs-club boards.
- **Friends** by invite link or username.
- **Garage** with 1,000+ makes and models, and **AI car mods** (widebody, stance, rally, track, matte wrap and more, or your own idea).
- **Trophies** in bronze, silver and gold.
- English and German, dark and light.

No stat is worth your safety: Roadclaim needs no interaction while driving, and there is no speed leaderboard on purpose.

## Screenshots

| Drive | Drives | Share card | Ride Replay | Leaderboard |
|---|---|---|---|---|
| ![Drive summary](docs/screens/1.png) | ![Drives](docs/screens/2.png) | ![Share card](docs/screens/3.png) | ![Ride Replay](docs/screens/4.png) | ![Leaderboard](docs/screens/5.png) |

## Download

<a href="https://roadclaim.codext.de/ios"><img alt="Download on the App Store" src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" height="48"></a>
<a href="https://roadclaim.codext.de/android"><img alt="Get it on Google Play" src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" height="70"></a>

## Privacy design

- **Routes stay on the phone.** Every drive is stored on the device as its own file and indexed in SQLite.
- **Cells, not coordinates.** For territory and leaderboards the app uploads drive totals and the H3 resolution 9 cell ids the drive passed through. GPS coordinates never leave the phone, unless the user switches on the optional cloud backup (off by default).
- **No sign-up.** An anonymous account is created on first launch. A recovery key moves it to a new phone.
- **Local-only mode** uploads nothing at all. **Hide from leaderboards** keeps you visible to friends only.
- **Deletion** in the app or on the website with the recovery key.
- No ads, no analytics, no tracking SDKs. The server runs in Germany.

Details: [privacy policy](https://roadclaim.codext.de/privacy/).

## Architecture

| Folder | What | Stack |
|---|---|---|
| [`app/`](app) | iOS and Android app | Expo SDK 57, React Native, expo-router, expo-location, expo-sqlite, react-native-maps, h3-js, a local Expo module for drive detection |
| [`server/`](server) | API for accounts, drives, territory, leaderboards, clubs, trophies and AI mods | Bun, Hono, Postgres |
| [`website/`](website) | roadclaim.codext.de: landing page, legal pages, invite links, app link files | Cloudflare Worker with static assets |
| [`docs/`](docs) | Product spec and API contract | [SPEC.md](docs/SPEC.md), [API.md](docs/API.md) |

Metrics (distance, brake presses, turns, lane changes, elevation and H3 cells) are computed on the device in pure TypeScript. The server only receives summaries and cell ids.

## Self-hosting the server

Run your own Roadclaim backend for your group or club. The server ships as a Docker image with Postgres via Docker Compose.

**Coolify:** create a new resource from this Git repository, choose the Docker Compose build pack with base directory `/deploy/coolify`, set the environment variables and a domain, and deploy.

**Plain Docker:**

```bash
git clone https://github.com/codextde/roadclaim
cd roadclaim
SERVICE_PASSWORD_POSTGRES=change-me SERVICE_PASSWORD_64_SECRET=$(openssl rand -hex 32) \
  docker compose -f deploy/coolify/docker-compose.yml -f deploy/coolify/docker-compose.local.yml up -d --build
```

Environment variables, migrations, backups and the optional `GEMINI_API_KEY` for AI mods are described in [server/README.md](server/README.md). Point the app at your server with `EXPO_PUBLIC_API_URL`.

## Development

Requirements: [Bun](https://bun.sh), Xcode for iOS, Android Studio for Android, and Docker or a local Postgres for the server.

```bash
# server
cd server
bun install
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/roadclaim
export SECRET_KEY=change-me-at-least-16-chars
bun run dev        # http://localhost:8080
bun test

# app
cd app
bun install
bunx expo prebuild
bun run ios        # or: bun run android
bun run check      # type check and unit tests
```

The app is a development build (`expo-dev-client`), not Expo Go, because it uses background location and a native module. Set `EXPO_PUBLIC_API_URL=http://<your-ip>:8080` to use a local server.

The car catalogue in `app/assets/data/cars.json` is generated from the public NHTSA vPIC API plus a curated list of European models: `node app/scripts/cars/build.mjs`.

Website: `cd website && bunx wrangler@latest dev`.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Codext GmbH

Made by [Codext GmbH](https://codext.de) in Germany.
