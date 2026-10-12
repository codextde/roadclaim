# Roadclaim server

The Roadclaim API: anonymous device accounts, drive uploads, H3 territory, leaderboards, friends, clubs, trophies and car mods. Bun + Hono + Postgres 17, no paid services. The full contract is in [docs/API.md](../docs/API.md).

## Self-hosting with Docker

You need Docker with Compose v2 and a clone of this repository. The compose file lives in `deploy/coolify/` and works with plain Docker as well as with Coolify.

1. Create `deploy/coolify/.env` with two secrets (generate them once and keep them: the database password is fixed when the volume is first created, and changing `SECRET_KEY` breaks image links and stored recovery keys):

   ```sh
   cd roadclaim
   printf 'SERVICE_PASSWORD_POSTGRES=%s\nSERVICE_PASSWORD_64_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > deploy/coolify/.env
   ```

   Optional lines in the same file: `GEMINI_API_KEY=...`, `PUBLIC_URL=https://api.example.com`, `MODS_PER_DAY=3`, `MODS_GLOBAL_PER_DAY=100`, `CORS_ORIGINS=...`, `API_PORT=8080`.

2. Build and start the API and Postgres, publishing the API on port 8080 of the host:

   ```sh
   docker compose -f deploy/coolify/docker-compose.yml -f deploy/coolify/docker-compose.local.yml up -d --build
   curl http://localhost:8080/health   # {"ok":true}
   ```

   Without a `.env` file, pass the two variables inline instead:

   ```sh
   SERVICE_PASSWORD_POSTGRES=change-me SERVICE_PASSWORD_64_SECRET=$(openssl rand -hex 32) \
     docker compose -f deploy/coolify/docker-compose.yml -f deploy/coolify/docker-compose.local.yml up -d --build
   ```

3. Put a TLS reverse proxy (Caddy, Traefik, nginx) in front of port 8080 and point the app at that URL (`EXPO_PUBLIC_API_URL`).

Update with `git pull` and the same `up -d --build` command; migrations run automatically at startup. Data lives in the `roadclaim-db` volume. Logs: `docker compose -f deploy/coolify/docker-compose.yml logs -f api`.

### Coolify v4

Create a resource from this repository with the Docker Compose build pack, base directory `/deploy/coolify`, compose file `/docker-compose.yml`, then assign a domain to the `api` service. Coolify generates `SERVICE_PASSWORD_POSTGRES` and `SERVICE_PASSWORD_64_SECRET` itself; set optional variables in its UI. Do not add `docker-compose.local.yml` there.

## Environment

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | | Postgres connection string (the compose file builds it from `SERVICE_PASSWORD_POSTGRES`) |
| `SECRET_KEY` | yes | | At least 16 characters (compose: `SERVICE_PASSWORD_64_SECRET`). Signs image URLs and encrypts recovery keys; keep it stable |
| `PORT` | no | `8080` | HTTP port inside the container |
| `PUBLIC_URL` | no | request origin | Public base URL used in image links, e.g. `https://roadclaim-api.codext.de` |
| `CORS_ORIGINS` | no | `https://roadclaim.codext.de` | Comma-separated origins allowed to call the API from a browser |
| `GEMINI_API_KEY` | no | | Enables car mods. Without it `/v1/config` reports `aiMods: false` and `POST /v1/mods` returns 503 |
| `GEMINI_IMAGE_MODEL` | no | `gemini-2.5-flash-image` | Gemini image model |
| `MODS_PER_DAY` | no | `3` | Car mods per user per UTC day (failed attempts are capped at 3x) |
| `MODS_GLOBAL_PER_DAY` | no | `100` | Car mods across all users per UTC day (failed attempts are capped at 3x) |
| `TRUST_PROXY` | no | `1` | Use `X-Forwarded-For` for client IPs (set `0` when not behind a reverse proxy) |
| `LOG_LEVEL` | no | | `silent` turns off the JSON logs |

## Development

```sh
cd server
bun install
DATABASE_URL=postgres://... SECRET_KEY=dev-secret-dev-secret bun run dev
bun run typecheck
./scripts/test-db.sh        # starts postgres:17-alpine on port 55432 and runs bun test
KEEP_DB=1 ./scripts/test-db.sh test/territory.test.ts
```
