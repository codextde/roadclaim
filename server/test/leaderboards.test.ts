import { describe, expect, test } from "bun:test";
import { cellsAround, setup } from "./helpers";

const t = await setup();

type Board = { entries: { rank: number; value: number; user: { id: string } }[]; me: { rank: number; value: number; user?: { id: string } } | null; scopeLabel: string };

async function board(token: string, query: string): Promise<Board> {
  const r = await t.req("GET", `/v1/leaderboards?${query}`, { token });
  expect(r.status).toBe(200);
  return r.json;
}
const rows = (b: Board) => b.entries.map((e) => [e.user.id, e.value, e.rank]);

describe("leaderboards", async () => {
  const a = await t.device({ homeCity: "Munich", homeCountry: "DE" });
  const b = await t.device();
  const c = await t.device({ privacy: { hideFromLeaderboards: true } });
  const d = await t.device({ homeCity: "Vienna", homeCountry: "AT" });
  const quiet = await t.device({ homeCity: "Munich" });

  await t.upload(a.token, cellsAround(48.13, 11.57, 1), { distanceM: 50_000 });
  await t.upload(a.token, cellsAround(48.15, 11.6, 1), { distanceM: 10_000 });
  await t.upload(b.token, cellsAround(48.2, 11.5, 2), { distanceM: 80_000, city: "munich", countryCode: "DE" });
  await t.upload(c.token, cellsAround(48.3, 11.4, 1), { distanceM: 200_000 });
  await t.upload(d.token, cellsAround(48.2, 16.37, 1), { distanceM: 30_000, city: "Vienna", countryCode: "AT" });
  const oldDrive = await t.upload(d.token, [], { distanceM: 500_000 });
  expect(oldDrive.status).toBe(201);
  await t.sql`update drives set started_at = date_trunc('year', now()) - interval '2 days' where distance_m = 500000`;
  await t.sql`update cells set claimed_at = date_trunc('year', now()) - interval '2 days' where owner_id = ${d.id}`;

  test("world distance hides hidden users from others", async () => {
    const world = await board(a.token, "metric=distance&scope=world&period=season");
    expect(world.scopeLabel).toBe("Worldwide");
    expect(rows(world)).toEqual([
      [b.id, 80_000, 1],
      [a.id, 60_000, 2],
      [d.id, 30_000, 3],
    ]);
    expect(world.me).toMatchObject({ rank: 2, value: 60_000 });
    const own = await board(c.token, "metric=distance&scope=world&period=season");
    expect(own.entries[0]!.user.id).toBe(c.id);
    expect(own.me).toMatchObject({ rank: 1, value: 200_000 });
  });

  test("longest ride and periods", async () => {
    const longest = await board(a.token, "metric=longest&scope=world&period=season");
    expect(rows(longest)[1]).toEqual([a.id, 50_000, 2]);
    const all = await board(d.token, "metric=distance&scope=world&period=season");
    expect(all.me?.value).toBe(30_000);
    for (const period of ["today", "week", "month", "season"]) {
      const r = await board(a.token, `metric=distance&scope=world&period=${period}`);
      expect(r.entries.length).toBeLessThanOrEqual(3);
    }
    expect((await t.req("GET", "/v1/leaderboards?period=year", { token: a.token })).status).toBe(400);
  });

  test("area counts cells claimed in the period that are still held", async () => {
    const area = await board(a.token, "metric=area&scope=world&period=season");
    expect(rows(area)).toEqual([
      [b.id, 19, 1],
      [a.id, 14, 2],
    ]);
  });

  test("city and country scopes use home city or the latest drive", async () => {
    const city = await board(a.token, "metric=distance&scope=city&period=season");
    expect(city.scopeLabel).toBe("Munich");
    expect(rows(city)).toEqual([
      [b.id, 80_000, 1],
      [a.id, 60_000, 2],
    ]);
    const quietView = await board(quiet.token, "metric=distance&scope=city&period=season");
    expect(quietView.me).toEqual({ rank: 3, value: 0, user: expect.objectContaining({ id: quiet.id }) });
    const country = await board(d.token, "metric=distance&scope=country&period=season");
    expect(country.scopeLabel).toBe("AT");
    expect(rows(country)).toEqual([[d.id, 30_000, 1]]);
  });

  test("friends board includes hidden friends", async () => {
    const invite = (await t.req("GET", "/v1/me", { token: c.token })).json.inviteCode;
    await t.req("POST", `/v1/friends/invite/${invite}`, { token: a.token });
    const friends = await board(a.token, "metric=distance&scope=friends&period=season");
    expect(friends.scopeLabel).toBe("Friends");
    expect(rows(friends)).toEqual([
      [c.id, 200_000, 1],
      [a.id, 60_000, 2],
    ]);
    const world = await board(a.token, "metric=distance&scope=world&period=season");
    expect(world.entries.map((e) => e.user.id)).not.toContain(c.id);
  });

  test("local-only users never appear", async () => {
    await t.req("PATCH", "/v1/me", { token: b.token, body: { privacy: { localOnly: true } } });
    const world = await board(a.token, "metric=distance&scope=world&period=season");
    expect(world.entries.map((e) => e.user.id)).not.toContain(b.id);
    const own = await board(b.token, "metric=distance&scope=world&period=season");
    expect(own.me).toBeNull();
    expect((await t.sql`select count(*)::int as n from cells where owner_id = ${b.id}`)[0].n).toBe(0);
    await t.req("PATCH", "/v1/me", { token: b.token, body: { privacy: { localOnly: false } } });
  });

  test("blocked users disappear for the blocker only", async () => {
    await t.req("POST", "/v1/blocks", { token: a.token, body: { userId: b.id } });
    const world = await board(a.token, "metric=distance&scope=world&period=season");
    expect(world.entries.map((e) => e.user.id)).not.toContain(b.id);
    expect(world.me?.rank).toBe(1);
    const other = await board(d.token, "metric=distance&scope=world&period=season");
    expect(other.entries.map((e) => e.user.id)).toContain(b.id);
    await t.req("DELETE", `/v1/blocks/${b.id}`, { token: a.token });
    expect((await board(a.token, "metric=distance&scope=world&period=season")).entries.map((e) => e.user.id)).toContain(b.id);
  });

  test("club scope and club-vs-club board", async () => {
    const club1 = (await t.req("POST", "/v1/clubs", { token: a.token, body: { name: "Isar Crew", color: "#10B981", isPublic: true } })).json;
    await t.req("POST", `/v1/clubs/${club1.id}/join`, { token: b.token });
    const club2 = (await t.req("POST", "/v1/clubs", { token: d.token, body: { name: "Donau Drivers", color: "#3B82F6", isPublic: true } })).json;
    const scoped = await board(a.token, "metric=distance&scope=club&period=season");
    expect(scoped.scopeLabel).toBe("Isar Crew");
    expect(rows(scoped)).toEqual([
      [b.id, 80_000, 1],
      [a.id, 60_000, 2],
    ]);
    const other = await board(a.token, `metric=distance&scope=club&period=season&clubId=${club2.id}`);
    expect(rows(other)).toEqual([[d.id, 30_000, 1]]);
    expect(other.me).toBeNull();
    const none = await board(quiet.token, "metric=distance&scope=club&period=season");
    expect(none.entries).toEqual([]);

    const clubs = (await t.req("GET", "/v1/leaderboards/clubs?metric=distance&period=season", { token: a.token })).json;
    expect(clubs.entries.map((e: any) => [e.club.id, e.value, e.rank])).toEqual([
      [club1.id, 140_000, 1],
      [club2.id, 30_000, 2],
    ]);
    expect(clubs.entries[0].club.inviteCode).toBeDefined();
    expect(clubs.entries[1].club.inviteCode).toBeUndefined();
    const area = (await t.req("GET", "/v1/leaderboards/clubs?metric=area&period=season", { token: a.token })).json;
    expect(area.entries.map((e: any) => [e.club.name, e.value])).toEqual([["Isar Crew", 14]]);
  });

  test("trophies metric counts tiers earned in the period", async () => {
    const r = await board(a.token, "metric=trophies&scope=world&period=season");
    const mine = r.entries.find((e) => e.user.id === a.id)!;
    const [{ n }] = await t.sql`select count(*)::int as n from trophy_awards where user_id = ${a.id}`;
    expect(mine.value).toBe(n);
    expect(n).toBeGreaterThan(0);
  });
});
