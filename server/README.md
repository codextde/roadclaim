# Roadclaim server

The Roadclaim API: anonymous device accounts, drive uploads, H3 territory, leaderboards, friends, clubs, trophies and car mods. Bun + Hono + Postgres 17, no paid services. The full contract is in [docs/API.md](../docs/API.md).

## Environment

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | | Postgres connection string, e.g. `postgres://roadclaim:pw@db:5432/roadclaim` |
| `SECRET_KEY` | yes | | At least 16 characters. Signs image URLs and encrypts recovery keys; keep it stable |
| `PORT` | no | `8080` | HTTP port |
| `PUBLIC_URL` | no | request origin | Public base URL used in image links, e.g. `https://roadclaim-api.codext.de` |
| `CORS_ORIGINS` | no | `https://roadclaim.codext.de` | Comma-separated origins allowed to call the API from a browser |
| `GEMINI_API_KEY` | no | | Enables car mods. Without it `/v1/config` reports `aiMods: false` and `POST /v1/mods` returns 503 |
| `GEMINI_IMAGE_MODEL` | no | `gemini-2.5-flash-image` | Gemini image model |
| `MODS_PER_DAY` | no | `3` | Car mods per user per UTC day |
| `MODS_GLOBAL_PER_DAY` | no | `100` | Car mods across all users per UTC day |
| `TRUST_PROXY` | no | `1` | Use `X-Forwarded-For` for client IPs (set `0` when not behind a reverse proxy) |
| `LOG_LEVEL` | no | | `silent` turns off the JSON logs |

Migrations in `migrations/` run automatically at startup.

## Docker Compose / Coolify

`deploy/coolify/docker-compose.yml` runs the API and Postgres. In Coolify v4 create a resource with the Docker Compose build pack, base directory `/deploy/coolify`, then assign a domain to the `api` service. Coolify generates the database password and `SECRET_KEY`.

Anywhere else, from the repository root:

```sh
SERVICE_PASSWORD_POSTGRES=change-me SERVICE_PASSWORD_64_SECRET=$(openssl rand -hex 32) \
  docker compose -f deploy/coolify/docker-compose.yml up -d --build
```

The compose file only exposes port 8080 inside the Docker network (Coolify's proxy routes to it). Elsewhere, add `ports: ["8080:8080"]` to the `api` service in an override file and put a TLS reverse proxy in front. `GET /health` checks the database.

## Development

```sh
bun install
DATABASE_URL=postgres://... SECRET_KEY=dev-secret-dev-secret bun run dev
bun run typecheck
./scripts/test-db.sh        # starts postgres:17-alpine on port 55432 and runs bun test
KEEP_DB=1 ./scripts/test-db.sh test/territory.test.ts
```
