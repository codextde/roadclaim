import { afterAll } from "bun:test";
import { gridDisk, latLngToCell } from "h3-js";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app";
import { loadConfig, type Config } from "../src/config";
import { connect, migrate, type Sql } from "../src/db";
import type { ImageGenerator } from "../src/gemini";
import { RateLimiter } from "../src/ratelimit";

process.env.LOG_LEVEL ??= "silent";

export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:55432/roadclaim_test";

let migrated = false;

export type TestClient = Awaited<ReturnType<typeof setup>>;

export async function setup(opts: { config?: Partial<Config>; generateImage?: ImageGenerator | null; limiter?: RateLimiter } = {}) {
  const sql: Sql = connect(DATABASE_URL);
  if (!migrated) {
    await migrate(sql);
    migrated = true;
  }
  await sql`truncate users, clubs, cells, cell_events, mod_usage_global restart identity cascade`;
  const config: Config = {
    ...loadConfig({ DATABASE_URL, SECRET_KEY: "test-secret-key-0123456789", CORS_ORIGINS: "https://roadclaim.codext.de" }),
    publicUrl: "https://api.test",
    ...opts.config,
  };
  const app = createApp({ sql, config, generateImage: opts.generateImage ?? null, limiter: opts.limiter });
  afterAll(() => sql.close());

  async function req(
    method: string,
    path: string,
    o: { token?: string; body?: unknown; ip?: string; headers?: Record<string, string>; raw?: string | FormData | Uint8Array } = {},
  ) {
    const headers: Record<string, string> = { "x-forwarded-for": o.ip ?? `10.${rnd()}.${rnd()}.${rnd()}`, ...o.headers };
    if (o.token) headers.authorization = `Bearer ${o.token}`;
    let body: RequestInit["body"] = o.raw;
    if (o.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(o.body);
    }
    const res = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body }));
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text, headers: res.headers };
  }

  async function device(patch?: Record<string, unknown>) {
    const r = await req("POST", "/v1/auth/device", { body: { platform: "ios" } });
    if (r.status !== 200) throw new Error(`device failed: ${r.text}`);
    const user = { token: r.json.token as string, id: r.json.me.id as string, recoveryKey: r.json.recoveryKey as string };
    if (patch) {
      const p = await req("PATCH", "/v1/me", { token: user.token, body: patch });
      if (p.status !== 200) throw new Error(`patch failed: ${p.text}`);
    }
    return user;
  }

  async function upload(token: string, cells: string[], extra: Record<string, unknown> = {}) {
    return req("POST", "/v1/drives", { token, body: drive(cells, extra) });
  }

  return { sql, app, config, req, device, upload };
}

function rnd() {
  return Math.floor(Math.random() * 250) + 1;
}

export function cellsAround(lat: number, lng: number, k = 1): string[] {
  return gridDisk(latLngToCell(lat, lng, 9), k);
}

export function drive(cells: string[], extra: Record<string, unknown> = {}) {
  const startedAt = new Date(Date.now() - 3600_000);
  return {
    id: randomUUID(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + 1800_000).toISOString(),
    distanceM: 20_000,
    durationS: 1800,
    movingS: 1600,
    maxSpeedMps: 30,
    avgSpeedMps: 12.5,
    elevationGainM: 120,
    elevationLossM: 100,
    brakePresses: 14,
    turnsLeft: 9,
    turnsRight: 11,
    laneChanges: 3,
    stops: 4,
    city: "Munich",
    countryCode: "DE",
    cells,
    ...extra,
  };
}
