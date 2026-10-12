import { describe, expect, test } from "bun:test";
import { cellsAround, setup } from "./helpers";
import { TROPHIES } from "../src/trophies";

const t = await setup();

const at = (iso: string) => ({ startedAt: iso, endedAt: new Date(Date.parse(iso) + 1800_000).toISOString() });
const byId = (items: { id: string }[]): Record<string, any> => Object.fromEntries(items.map((x) => [x.id, x]));

describe("trophies", () => {
  test("definitions are public with English and German texts", async () => {
    const r = await t.req("GET", "/v1/trophies/definitions");
    expect(r.status).toBe(200);
    expect(r.json.items).toHaveLength(TROPHIES.length);
    for (const d of r.json.items) {
      expect(d.title.en && d.title.de && d.description.en && d.description.de).toBeTruthy();
      expect(d.tiers.length).toBeGreaterThanOrEqual(1);
      expect([...d.tiers].sort((x: number, y: number) => x - y)).toEqual(d.tiers);
    }
    expect(byId(r.json.items).distance_total.tiers).toEqual([100, 1000, 10000]);
  });

  test("earned after uploads and returned once", async () => {
    const u = await t.device();
    const first = await t.upload(u.token, cellsAround(48.0, 7.85), { distanceM: 150_000, elevationGainM: 1600, avgSpeedMps: 25, countryCode: "DE", ...at("2026-03-02T01:30:00+01:00") });
    const earned = byId(first.json.newTrophies);
    expect(earned.first_drive).toMatchObject({ tier: 1, next: null });
    expect(earned.distance_total).toMatchObject({ tier: 1, value: 150, next: 1000 });
    expect(earned.distance_single).toMatchObject({ tier: 1, value: 150, next: 300 });
    expect(earned.climber).toMatchObject({ tier: 2, value: 1600, next: 3000 });
    expect(earned.night_drive).toMatchObject({ tier: 1 });
    expect(earned.early_bird).toBeUndefined();
    expect(earned.countries).toBeUndefined();
    expect(earned.first_drive.earnedAt).toBeTruthy();

    const second = await t.upload(u.token, cellsAround(47.5, 7.6), { countryCode: "CH", ...at("2026-03-03T05:10:00Z"), utcOffsetMin: 0 });
    const earned2 = byId(second.json.newTrophies);
    expect(Object.keys(earned2).sort()).toEqual(["countries", "early_bird"]);
    expect(earned2.countries).toMatchObject({ tier: 1, value: 2, next: 5 });

    const third = await t.upload(u.token, [], { ...at("2026-03-04T12:00:00Z") });
    expect(byId(third.json.newTrophies).streak).toMatchObject({ tier: 1, value: 3 });

    const list = byId((await t.req("GET", "/v1/trophies", { token: u.token })).json.items);
    expect(Object.keys(list)).toHaveLength(TROPHIES.length);
    expect(list.club).toMatchObject({ tier: 0, value: 0, next: 1, earnedAt: null });
    expect(list.active_days).toMatchObject({ tier: 0, value: 3, next: 7 });
    expect(list.cells_held).toMatchObject({ tier: 0, value: 14, next: 100 });

    await t.req("POST", "/v1/clubs", { token: u.token, body: { name: "Trophy Club", color: "#10B981", isPublic: true } });
    const afterClub = byId((await t.req("GET", "/v1/trophies", { token: u.token })).json.items);
    expect(afterClub.club).toMatchObject({ tier: 1, next: null });
  });

  test("tiers never drop and steals count", async () => {
    const a = await t.device();
    const b = await t.device();
    const cells = cellsAround(46.0, 8.95, 5);
    await t.upload(a.token, cells, { distanceM: 50_000 });
    const held = byId((await t.req("GET", "/v1/trophies", { token: a.token })).json.items).cells_held;
    expect(held).toMatchObject({ tier: 0, value: 91 });
    await t.upload(a.token, cellsAround(46.2, 8.95, 1), { distanceM: 50_000 });
    expect(byId((await t.req("GET", "/v1/trophies", { token: a.token })).json.items).cells_held.tier).toBe(0);
    const big = cellsAround(46.0, 8.95, 6);
    const steal = await t.upload(b.token, big, { distanceM: 50_000 });
    expect(steal.json.territory.stolen).toBe(91);
    expect(byId(steal.json.newTrophies).steals).toMatchObject({ tier: 2, value: 91, next: 500 });
    expect(byId(steal.json.newTrophies).cells_held).toMatchObject({ tier: 1, value: 127 });
    await t.upload(a.token, big, { distanceM: 50_000 });
    expect(byId((await t.req("GET", "/v1/trophies", { token: b.token })).json.items).cells_held).toMatchObject({ tier: 1, value: 0 });
  });
});
