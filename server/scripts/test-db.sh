#!/usr/bin/env bash
# Runs the test suite against a throwaway Postgres 17 in Docker on port 55432.
# KEEP_DB=1 keeps the container running for faster reruns.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=roadclaim-test-db
PORT=55432
URL="postgres://postgres:postgres@127.0.0.1:${PORT}/roadclaim_test"

if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=roadclaim_test \
    -p "${PORT}:5432" --tmpfs /var/lib/postgresql/data postgres:17-alpine >/dev/null
fi

for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres -d roadclaim_test -h 127.0.0.1 >/dev/null 2>&1; then break; fi
  sleep 0.5
done
docker exec "$NAME" psql -U postgres -d roadclaim_test -qc "drop schema public cascade; create schema public;" >/dev/null

cleanup() { [ "${KEEP_DB:-0}" = "1" ] || docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

TEST_DATABASE_URL="$URL" bun test "$@"
