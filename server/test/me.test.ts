import { describe, expect, test } from "bun:test";
import { cellsAround, setup } from "./helpers";

const t = await setup();

describe("me", () => {
  test("patches the profile", async () => {
    const u = await t.device();
    const r = await t.req("PATCH", "/v1/me", {
      token: u.token,
      body: {
        username: "Road_Runner.1",
        displayName: "  Road Runner ",
        avatarColor: "#3b82f6",
        car: { id: "bmw-m3-e46", label: "BMW M3 (E46)", color: "Silver" },
        homeCity: "Munich",
        homeCountry: "de",
        privacy: { hideFromLeaderboards: true },
      },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      username: "road_runner.1",
      displayName: "Road Runner",
      avatarColor: "#3B82F6",
      car: { id: "bmw-m3-e46", label: "BMW M3 (E46)", color: "Silver" },
      homeCity: "Munich",
      homeCountry: "DE",
      privacy: { localOnly: false, hideFromLeaderboards: true, cloudBackup: false },
    });
    const cleared = await t.req("PATCH", "/v1/me", { token: u.token, body: { car: null, homeCity: null } });
    expect(cleared.json.car).toBeNull();
    expect(cleared.json.homeCity).toBeNull();
    expect((await t.req("GET", "/v1/me", { token: u.token })).json.privacy.hideFromLeaderboards).toBe(true);
  });

  test("rejects a taken username with 409", async () => {
    const a = await t.device({ username: "taken_name" });
    const b = await t.device();
    const r = await t.req("PATCH", "/v1/me", { token: b.token, body: { username: "TAKEN_NAME" } });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("username_taken");
    expect((await t.req("PATCH", "/v1/me", { token: a.token, body: { username: "taken_name" } })).status).toBe(200);
  });

  test("validates fields", async () => {
    const u = await t.device();
    for (const body of [
      { username: "ab" },
      { username: "has space" },
      { username: "x".repeat(21) },
      { avatarColor: "green" },
      { homeCountry: "DEU" },
      { displayName: "" },
      { privacy: { unknown: true } },
      { nope: 1 },
    ]) {
      const r = await t.req("PATCH", "/v1/me", { token: u.token, body });
      expect(r.status).toBe(400);
    }
  });

  test("stats per period", async () => {
    const u = await t.device();
    await t.upload(u.token, cellsAround(48.137, 11.575), { distanceM: 30_000 });
    await t.upload(u.token, cellsAround(48.2, 11.6), { distanceM: 10_000, countryCode: "AT" });
    const old = await t.upload(u.token, [], { distanceM: 5_000 });
    expect(old.status).toBe(201);
    await t.sql`update drives set started_at = now() - interval '400 days' where distance_m = 5000 and user_id = ${u.id}`;
    const s = (await t.req("GET", "/v1/me/stats?period=season", { token: u.token })).json;
    expect(s).toMatchObject({ distanceM: 40_000, drives: 2, longestM: 30_000, cellsHeld: 14, cellsEver: 14, countries: 2, durationS: 3600 });
    expect(s.activeDays).toBeGreaterThanOrEqual(1);
    expect(s.trophies).toBeGreaterThan(0);
    expect((await t.req("GET", "/v1/me/stats?period=today", { token: u.token })).json.distanceM).toBeGreaterThanOrEqual(0);
    expect((await t.req("GET", "/v1/me/stats?period=decade", { token: u.token })).status).toBe(400);
  });
});
