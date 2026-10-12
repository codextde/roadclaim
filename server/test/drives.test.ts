import { describe, expect, test } from "bun:test";
import { latLngToCell } from "h3-js";
import { RateLimiter, RATE_RULES } from "../src/ratelimit";
import { cellsAround, drive, setup } from "./helpers";

const t = await setup();

describe("drive upload", () => {
  test("stores the drive and claims territory", async () => {
    const u = await t.device();
    const cells = cellsAround(52.52, 13.405);
    const r = await t.upload(u.token, cells);
    expect(r.status).toBe(201);
    expect(r.json.territory).toEqual({ claimed: 7, stolen: 0, refreshed: 0, held: 7 });
    expect(r.json.newTrophies.map((x: { id: string }) => x.id)).toContain("first_drive");
    const [row] = await t.sql`select * from drives where user_id = ${u.id}`;
    expect(row.distance_m).toBe(20_000);
    expect(row.cell_count).toBe(7);
  });

  test("is idempotent by id", async () => {
    const u = await t.device();
    const body = drive(cellsAround(50.11, 8.68));
    const first = await t.req("POST", "/v1/drives", { token: u.token, body });
    const second = await t.req("POST", "/v1/drives", { token: u.token, body });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.json).toEqual({ territory: first.json.territory, newTrophies: [] });
    expect((await t.sql`select count(*)::int as n from drives where id = ${body.id}`)[0].n).toBe(1);
    expect((await t.sql`select count(*)::int as n from cell_events where to_user = ${u.id}`)[0].n).toBe(7);
    const other = await t.device();
    const clash = await t.req("POST", "/v1/drives", { token: other.token, body });
    expect(clash.status).toBe(409);
    expect(clash.json.error.code).toBe("drive_exists");
  });

  test("handles a long drive with 2,000 cells in one go", async () => {
    const u = await t.device();
    const cells = [...new Set(Array.from({ length: 2600 }, (_, i) => latLngToCell(47 + i * 0.0025, 9 + i * 0.001, 9)))].slice(0, 2000);
    expect(cells.length).toBe(2000);
    const r = await t.upload(u.token, cells, { distanceM: 400_000, durationS: 14_400, movingS: 14_000, avgSpeedMps: 28 });
    expect(r.status).toBe(201);
    expect(r.json.territory).toEqual({ claimed: 2000, stolen: 0, refreshed: 0, held: 2000 });
  });

  test("validates the payload", async () => {
    const u = await t.device();
    const cells = cellsAround(48.78, 9.18);
    const cases: [Record<string, unknown>, string][] = [
      [{ avgSpeedMps: 71 }, "avgSpeedMps"],
      [{ distanceM: 1000, cells: cellsAround(48.78, 9.18, 3) }, "too many cells"],
      [{ cells: [...cells, "not-a-cell"] }, "invalid H3"],
      [{ cells: [latLngToCell(48.78, 9.18, 8)] }, "invalid H3"],
      [{ endedAt: new Date(Date.now() - 7200_000).toISOString() }, "endedAt"],
      [{ id: "123" }, "id"],
      [{ countryCode: "Germany" }, "countryCode"],
      [{ distanceM: -1 }, "distanceM"],
    ];
    for (const [extra, msg] of cases) {
      const r = await t.req("POST", "/v1/drives", { token: u.token, body: drive(cells, extra) });
      expect(r.status).toBe(400);
      expect(r.json.error.message).toContain(msg);
    }
    expect((await t.sql`select count(*)::int as n from drives where user_id = ${u.id}`)[0].n).toBe(0);
  });

  test("refuses uploads for local-only accounts", async () => {
    const u = await t.device({ privacy: { localOnly: true } });
    const r = await t.upload(u.token, cellsAround(48.0, 11.0));
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("local_only");
  });

  test("delete removes the drive from stats but keeps territory", async () => {
    const u = await t.device();
    const body = drive(cellsAround(53.55, 9.99));
    await t.req("POST", "/v1/drives", { token: u.token, body });
    expect((await t.req("DELETE", `/v1/drives/${body.id}`, { token: u.token })).json).toEqual({ ok: true });
    const stats = (await t.req("GET", "/v1/me/stats", { token: u.token })).json;
    expect(stats.drives).toBe(0);
    expect(stats.cellsHeld).toBe(7);
    expect((await t.req("DELETE", `/v1/drives/${body.id}`, { token: u.token })).status).toBe(404);
  });

  test("rejects oversized bodies", async () => {
    const u = await t.device();
    const r = await t.req("POST", "/v1/drives", {
      token: u.token,
      raw: JSON.stringify({ pad: "x".repeat(1_100_000) }),
      headers: { "content-type": "application/json" },
    });
    expect(r.status).toBe(413);
  });

  test("limits uploads per user", async () => {
    const limited = await setup({ limiter: new RateLimiter({ ...RATE_RULES, upload: { limit: 2, windowMs: 3600_000 } }) });
    const u = await limited.device();
    expect((await limited.upload(u.token, [])).status).toBe(201);
    expect((await limited.upload(u.token, [])).status).toBe(201);
    const r = await limited.upload(u.token, []);
    expect(r.status).toBe(429);
  });
});
