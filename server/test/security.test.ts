import { describe, expect, test } from "bun:test";
import { cellToLatLng, latLngToCell } from "h3-js";
import { RateLimiter, RATE_RULES } from "../src/ratelimit";
import { backfillParents } from "../src/territory";
import { cellsAround, drive, setup } from "./helpers";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
let mode: "ok" | "fail" | "html" = "ok";

const t = await setup({
  config: {
    backupMaxCount: 2,
    backupMaxBytes: 1000,
    geminiApiKey: "test",
    modsPerDay: 2,
    modsGlobalPerDay: 3,
    boardCacheMs: 60_000,
    seasonStartMonth: "2026-10",
  },
  limiter: new RateLimiter({ ...RATE_RULES, backup: { limit: 6, windowMs: 3600_000 } }),
  generateImage: async () => {
    if (mode === "fail") throw new Error("down");
    if (mode === "html") return { mimeType: "text/html", data: new TextEncoder().encode("<script>alert(1)</script>") };
    return { mimeType: "image/png", data: png };
  },
});

const inviteOf = async (token: string) => (await t.req("GET", "/v1/me", { token })).json.inviteCode as string;
const befriend = async (a: { token: string }, b: { token: string }) => t.req("POST", `/v1/friends/invite/${await inviteOf(b.token)}`, { token: a.token });
const modForm = () => {
  const f = new FormData();
  f.set("style", "track");
  f.set("carLabel", "Audi RS3");
  return f;
};

describe("backup quota", () => {
  test("limits count, total size and request rate", async () => {
    const u = await t.device({ privacy: { cloudBackup: true } });
    const put = (id: string, body: string) => t.req("PUT", `/v1/backup/drives/${id}`, { token: u.token, raw: body });
    expect((await put("a", JSON.stringify({ pad: "x".repeat(300) }))).status).toBe(200);
    expect((await put("b", "{}")).status).toBe(200);
    const third = await put("c", "{}");
    expect(third.status).toBe(413);
    expect(third.json.error.code).toBe("quota_exceeded");
    expect((await put("a", JSON.stringify({ pad: "x".repeat(900) }))).status).toBe(200);
    const tooBig = await put("b", JSON.stringify({ pad: "x".repeat(200) }));
    expect(tooBig.json.error.code).toBe("quota_exceeded");
    expect((await put("b", "[]")).status).toBe(200);
    const limited = await put("b", "[]");
    expect(limited.status).toBe(429);
  });
});

describe("drive plausibility", () => {
  test("rejects implausible uploads", async () => {
    const u = await t.device();
    const near = cellsAround(48.1, 11.5);
    const far = latLngToCell(48.1, 12.5, 9);
    const line = Array.from({ length: 40 }, (_, i) => latLngToCell(48 + i * 0.005, 11, 9));
    const cases: [Record<string, unknown>, string][] = [
      [{ ...drive(near), movingS: 2000, durationS: 1000 }, "movingS"],
      [{ ...drive(near), distanceM: 100_000, maxSpeedMps: 10, movingS: 600, durationS: 700, avgSpeedMps: 1 }, "distanceM"],
      [drive([...near, far], { distanceM: 200_000 }), "too far apart"],
      [{ ...drive(line), distanceM: 3000 }, "more ground"],
      [{ ...drive(near), maxSpeedMps: 91 }, "maxSpeedMps"],
    ];
    for (const [body, msg] of cases) {
      const r = await t.req("POST", "/v1/drives", { token: u.token, body });
      expect(r.status).toBe(400);
      expect(r.json.error.message).toContain(msg);
    }
    expect((await t.req("POST", "/v1/drives", { token: u.token, body: { ...drive(line), distanceM: 33_000 } })).status).toBe(201);
  });
});

describe("local-only accounts", () => {
  test("drop their cells, hide their profile and turf", async () => {
    const a = await t.device();
    const viewer = await t.device();
    const club = (await t.req("POST", "/v1/clubs", { token: viewer.token, body: { name: "Turf Club", color: "#10B981", isPublic: true } })).json;
    await t.req("POST", `/v1/clubs/${club.id}/join`, { token: a.token });
    const cells = cellsAround(52.37, 4.89);
    await t.upload(a.token, cells);
    const [lat, lng] = cellToLatLng(cells[0]!);
    const bbox = `${lat - 0.02},${lng - 0.02},${lat + 0.02},${lng + 0.02}`;
    expect((await t.req("GET", `/v1/territory/cells?bbox=${bbox}`, { token: viewer.token })).json.cells).toHaveLength(7);
    expect((await t.req("GET", `/v1/clubs/${club.id}`, { token: viewer.token })).json.club.cellsHeld).toBe(7);

    await t.req("PATCH", "/v1/me", { token: a.token, body: { privacy: { localOnly: true } } });
    expect((await t.req("GET", `/v1/territory/cells?bbox=${bbox}`, { token: viewer.token })).json.cells).toEqual([]);
    expect((await t.req("GET", `/v1/clubs/${club.id}`, { token: viewer.token })).json.club.cellsHeld).toBe(0);
    expect((await t.req("GET", `/v1/users/${a.id}`, { token: viewer.token })).status).toBe(404);
    expect((await t.req("GET", `/v1/compare/${a.id}`, { token: viewer.token })).status).toBe(404);
    expect((await t.req("GET", `/v1/users/${a.id}`, { token: a.token })).status).toBe(200);
    const members = (await t.req("GET", `/v1/clubs/${club.id}`, { token: viewer.token })).json.members;
    expect(members.map((m: any) => m.user.id)).toEqual([viewer.id]);
  });
});

describe("club privacy", () => {
  test("private clubs are invisible to non-members", async () => {
    const owner = await t.device();
    const outsider = await t.device();
    const club = (await t.req("POST", "/v1/clubs", { token: owner.token, body: { name: "Hidden Garage", color: "#10B981", isPublic: false } })).json;
    await t.upload(owner.token, cellsAround(41.9, 12.49), { distanceM: 25_000 });
    expect((await t.req("GET", `/v1/clubs/${club.id}`, { token: outsider.token })).status).toBe(404);
    expect((await t.req("GET", `/v1/leaderboards?scope=club&clubId=${club.id}`, { token: outsider.token })).status).toBe(404);
    expect((await t.req("GET", `/v1/territory/cells?bbox=41.85,12.4,41.95,12.55&clubId=${club.id}`, { token: outsider.token })).status).toBe(404);
    expect((await t.req("GET", `/v1/territory/cells?bbox=41.85,12.4,41.95,12.55&clubId=${club.id}`, { token: owner.token })).json.cells).toHaveLength(7);
    const forOutsider = (await t.req("GET", "/v1/leaderboards/clubs?metric=distance", { token: outsider.token })).json.entries;
    expect(forOutsider.map((e: any) => e.club.id)).not.toContain(club.id);
    const forOwner = (await t.req("GET", "/v1/leaderboards/clubs?metric=distance", { token: owner.token })).json.entries;
    expect(forOwner.map((e: any) => e.club.id)).toContain(club.id);
  });

  test("member list hides local-only, hidden and blocked members from strangers", async () => {
    const owner = await t.device();
    const hidden = await t.device({ privacy: { hideFromLeaderboards: true } });
    const friend = await t.device({ privacy: { hideFromLeaderboards: true } });
    const quiet = await t.device();
    const blocker = await t.device();
    const club = (await t.req("POST", "/v1/clubs", { token: owner.token, body: { name: "Mixed Club", color: "#10B981", isPublic: true } })).json;
    for (const u of [hidden, friend, quiet, blocker]) await t.req("POST", `/v1/clubs/${club.id}/join`, { token: u.token });
    await t.upload(hidden.token, [], { distanceM: 9000 });
    await t.upload(friend.token, [], { distanceM: 8000 });
    await t.req("PATCH", "/v1/me", { token: quiet.token, body: { privacy: { localOnly: true } } });
    await befriend(owner, friend);
    await t.req("POST", "/v1/blocks", { token: blocker.token, body: { userId: owner.id } });
    const members = (await t.req("GET", `/v1/clubs/${club.id}`, { token: owner.token })).json.members;
    const byId = Object.fromEntries(members.map((m: any) => [m.user.id, m.distanceM]));
    expect(Object.keys(byId).sort()).toEqual([owner.id, hidden.id, friend.id].sort());
    expect(byId[hidden.id]).toBeNull();
    expect(byId[friend.id]).toBe(8000);
    expect(byId[owner.id]).toBe(0);
    const own = (await t.req("GET", `/v1/clubs/${club.id}`, { token: hidden.token })).json.members;
    expect(own.find((m: any) => m.user.id === hidden.id).distanceM).toBe(9000);
  });
});

describe("blocks in both directions", () => {
  test("the blocked user no longer sees the blocker", async () => {
    const blocker = await t.device({ username: "two_way_blocker" });
    const blocked = await t.device();
    const cells = cellsAround(59.33, 18.06);
    await t.upload(blocker.token, cells, { distanceM: 70_000 });
    await t.upload(blocked.token, [], { distanceM: 1000 });
    await t.req("POST", "/v1/blocks", { token: blocker.token, body: { userId: blocked.id } });
    const world = (await t.req("GET", "/v1/leaderboards?metric=distance&scope=world&period=season", { token: blocked.token })).json;
    expect(world.entries.map((e: any) => e.user.id)).not.toContain(blocker.id);
    const season = (await t.req("GET", "/v1/territory/season?board=overall", { token: blocked.token })).json;
    expect(season.entries.map((e: any) => e.user.id)).not.toContain(blocker.id);
    expect((await t.req("GET", "/v1/users/search?q=two_way", { token: blocked.token })).json.items).toEqual([]);
    expect((await t.req("GET", `/v1/users/${blocker.id}`, { token: blocked.token })).status).toBe(404);
    expect((await t.req("GET", `/v1/users/${blocked.id}`, { token: blocker.token })).status).toBe(404);
    expect((await t.req("GET", `/v1/compare/${blocker.id}`, { token: blocked.token })).status).toBe(404);
    const [lat, lng] = cellToLatLng(cells[0]!);
    const seen = (await t.req("GET", `/v1/territory/cells?bbox=${lat - 0.02},${lng - 0.02},${lat + 0.02},${lng + 0.02}`, { token: blocked.token })).json.cells;
    expect(seen).toHaveLength(7);
    expect(seen.every((c: any) => c.owner === "other" && c.name === "")).toBe(true);
  });
});

describe("board cache and season range", () => {
  test("world boards are cached for 60 seconds", async () => {
    const a = await t.device();
    await t.upload(a.token, [], { distanceM: 400_000 });
    const first = (await t.req("GET", "/v1/leaderboards?metric=longest&scope=world&period=season", { token: a.token })).json;
    expect(first.entries[0].user.id).toBe(a.id);
    const b = await t.device();
    await t.upload(b.token, [], { distanceM: 450_000 });
    const second = (await t.req("GET", "/v1/leaderboards?metric=longest&scope=world&period=season", { token: b.token })).json;
    expect(second.entries[0].user.id).toBe(a.id);
    const uncached = (await t.req("GET", "/v1/leaderboards?metric=longest&scope=friends&period=season", { token: b.token })).json;
    expect(uncached.entries[0].user.id).toBe(b.id);
  });

  test("season months start at 2026-10", async () => {
    const u = await t.device();
    const r = await t.req("GET", "/v1/territory/season?month=2026-09", { token: u.token });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("invalid_month");
    expect((await t.req("GET", `/v1/territory/season?month=${new Date().toISOString().slice(0, 7)}`, { token: u.token })).status).toBe(200);
  });
});

describe("account security", () => {
  test("rotate-recovery issues a new key and revokes other sessions", async () => {
    const u = await t.device();
    const second = (await t.req("POST", "/v1/auth/restore", { body: { recoveryKey: u.recoveryKey } })).json.token;
    const r = await t.req("POST", "/v1/auth/rotate-recovery", { token: second });
    expect(r.json.recoveryKey).toMatch(/^RC-/);
    expect(r.json.recoveryKey).not.toBe(u.recoveryKey);
    expect((await t.req("GET", "/v1/me", { token: u.token })).status).toBe(401);
    expect((await t.req("GET", "/v1/me", { token: second })).status).toBe(200);
    expect((await t.req("GET", "/v1/auth/recovery-key", { token: second })).json.recoveryKey).toBe(r.json.recoveryKey);
    expect((await t.req("POST", "/v1/auth/restore", { body: { recoveryKey: u.recoveryKey } })).status).toBe(404);
    expect((await t.req("POST", "/v1/auth/restore", { body: { recoveryKey: r.json.recoveryKey } })).status).toBe(200);
  });

  test("signups are limited per IPv6 /64", async () => {
    for (let i = 1; i <= 20; i++) {
      expect((await t.req("POST", "/v1/auth/device", { body: { platform: "ios" }, ip: `2001:db8:7:9::${i.toString(16)}` })).status).toBe(200);
    }
    const same = await t.req("POST", "/v1/auth/device", { body: { platform: "ios" }, ip: "2001:0db8:0007:0009:abcd:1:2:3" });
    expect(same.status).toBe(429);
    expect((await t.req("POST", "/v1/auth/device", { body: { platform: "ios" }, ip: "2001:db8:7:a::1" })).status).toBe(200);
  });

  test("car label, colour and home city are moderated", async () => {
    const u = await t.device();
    for (const body of [{ car: { id: "x", label: "Fotzenmobil" } }, { car: { id: "x", label: "Golf", color: "sh1t brown" } }, { homeCity: "Wichserhausen" }]) {
      const r = await t.req("PATCH", "/v1/me", { token: u.token, body });
      expect(r.status).toBe(422);
      expect(r.json.error.code).toBe("inappropriate_name");
    }
  });

  test("cell parents are backfilled for the map index", async () => {
    const u = await t.device();
    const cells = cellsAround(60.17, 24.94);
    await t.upload(u.token, cells);
    await t.sql`update cells set parent5 = null where owner_id = ${u.id}`;
    expect(await backfillParents(t.sql)).toBeGreaterThanOrEqual(7);
    const [lat, lng] = cellToLatLng(cells[0]!);
    const r = await t.req("GET", `/v1/territory/cells?bbox=${lat - 0.29},${lng - 0.29},${lat + 0.29},${lng + 0.29}`, { token: u.token });
    expect(r.json.cells).toHaveLength(7);
  });
});

describe("mod limits", () => {
  test("only PNG or JPEG is stored and served with nosniff", async () => {
    const u = await t.device();
    const ok = await t.req("POST", "/v1/mods", { token: u.token, raw: modForm() });
    expect(ok.status).toBe(201);
    const url = new URL(ok.json.imageUrl);
    const img = await t.app.fetch(new Request(`http://localhost${url.pathname}${url.search}`));
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    mode = "html";
    const bad = await t.req("POST", "/v1/mods", { token: u.token, raw: modForm() });
    mode = "ok";
    expect(bad.status).toBe(502);
    expect((await t.sql`select count(*)::int as n from mods where user_id = ${u.id}`)[0].n).toBe(1);
  });

  test("failed attempts are capped per user and server-wide", async () => {
    const u = await t.device();
    mode = "fail";
    for (let i = 0; i < 6; i++) expect((await t.req("POST", "/v1/mods", { token: u.token, raw: modForm() })).status).toBe(502);
    const capped = await t.req("POST", "/v1/mods", { token: u.token, raw: modForm() });
    expect(capped.status).toBe(429);
    expect(capped.json.error.code).toBe("limit_reached");
    expect((await t.req("GET", "/v1/mods", { token: u.token })).json.remainingToday).toBe(0);

    const v = await t.device();
    expect((await t.req("POST", "/v1/mods", { token: v.token, raw: modForm() })).status).toBe(502);
    mode = "ok";
    const w = await t.device();
    expect((await t.req("GET", "/v1/mods", { token: w.token })).json.remainingToday).toBe(0);
    const global = await t.req("POST", "/v1/mods", { token: w.token, raw: "not multipart", headers: { "content-type": "text/plain" } });
    expect(global.status).toBe(429);
    expect(global.json.error.code).toBe("global_limit");
  });
});
