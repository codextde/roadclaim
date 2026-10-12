import { describe, expect, test } from "bun:test";
import { cellToLatLng } from "h3-js";
import { cellsAround, setup } from "./helpers";

const t = await setup();

const month = (d = new Date()) => d.toISOString().slice(0, 7);
const ids = (entries: { user: { id: string } }[]) => entries.map((e) => e.user.id);

describe("territory", async () => {
  const a = await t.device({ displayName: "Alice" });
  const b = await t.device({ displayName: "Bob" });
  const area = cellsAround(48.137, 11.575, 2);
  const aCells = area.slice(0, 12);
  const bCells = area.slice(6, 19);

  test("claim, steal and refresh across two users", async () => {
    const first = await t.upload(a.token, aCells);
    expect(first.json.territory).toEqual({ claimed: 12, stolen: 0, refreshed: 0, held: 12 });
    const second = await t.upload(b.token, bCells);
    expect(second.json.territory).toEqual({ claimed: 7, stolen: 6, refreshed: 0, held: 13 });
    const third = await t.upload(a.token, area.slice(0, 8));
    expect(third.json.territory).toEqual({ claimed: 0, stolen: 2, refreshed: 6, held: 8 });
    expect(third.json.newTrophies.map((x: { id: string }) => x.id)).toContain("steals");
  });

  test("my map lists held and ever-held cells", async () => {
    const mine = (await t.req("GET", "/v1/territory/mine", { token: a.token })).json;
    expect(mine.held).toHaveLength(8);
    expect(mine.ever).toHaveLength(12);
    expect(mine.ever).toEqual([...aCells].sort());
    const bMine = (await t.req("GET", "/v1/territory/mine", { token: b.token })).json;
    expect(bMine.held).toHaveLength(11);
    expect(bMine.ever).toHaveLength(13);
  });

  test("cells in a bbox are classified relative to the caller", async () => {
    const [lat, lng] = cellToLatLng(area[0]!);
    const bbox = `${lat - 0.05},${lng - 0.05},${lat + 0.05},${lng + 0.05}`;
    let r = await t.req("GET", `/v1/territory/cells?bbox=${bbox}`, { token: a.token });
    expect(r.json.cells).toHaveLength(19);
    const owners = (cells: { owner: string }[]) => cells.reduce<Record<string, number>>((m, c) => ({ ...m, [c.owner]: (m[c.owner] ?? 0) + 1 }), {});
    expect(owners(r.json.cells)).toEqual({ me: 8, other: 11 });
    const mineCell = r.json.cells.find((c: { owner: string }) => c.owner === "me");
    expect(mineCell).toMatchObject({ userId: a.id, name: "Alice" });

    const invite = (await t.req("GET", "/v1/me", { token: b.token })).json.inviteCode;
    await t.req("POST", `/v1/friends/invite/${invite}`, { token: a.token });
    r = await t.req("GET", `/v1/territory/cells?bbox=${bbox}`, { token: a.token });
    expect(owners(r.json.cells)).toEqual({ me: 8, friend: 11 });

    const c = await t.device();
    const club = (await t.req("POST", "/v1/clubs", { token: c.token, body: { name: "Isar Crew", color: "#F59E0B", isPublic: true } })).json;
    await t.req("POST", `/v1/clubs/${club.id}/join`, { token: b.token });
    r = await t.req("GET", `/v1/territory/cells?bbox=${bbox}`, { token: c.token });
    expect(owners(r.json.cells)).toEqual({ other: 8, club: 11 });
    r = await t.req("GET", `/v1/territory/cells?bbox=${bbox}&clubId=${club.id}`, { token: a.token });
    expect(r.json.cells).toHaveLength(11);
    const clubInfo = (await t.req("GET", `/v1/clubs/${club.id}`, { token: c.token })).json.club;
    expect(clubInfo.cellsHeld).toBe(11);
    await t.req("POST", `/v1/clubs/${club.id}/leave`, { token: b.token });
    r = await t.req("GET", `/v1/territory/cells?bbox=${bbox}&clubId=${club.id}`, { token: a.token });
    expect(r.json.cells).toHaveLength(0);
  });

  test("large or malformed bboxes are rejected", async () => {
    const big = await t.req("GET", "/v1/territory/cells?bbox=48,11,48.7,11.2", { token: a.token });
    expect(big.status).toBe(413);
    expect(big.json.error.code).toBe("zoom_in");
    expect((await t.req("GET", "/v1/territory/cells?bbox=48,11", { token: a.token })).status).toBe(400);
    expect((await t.req("GET", "/v1/territory/cells?bbox=49,11,48,11.1", { token: a.token })).status).toBe(400);
  });

  test("season boards for the current month", async () => {
    const board = async (name: string, token = a.token, scope = "world") =>
      (await t.req("GET", `/v1/territory/season?board=${name}&month=${month()}&scope=${scope}`, { token })).json;
    const overall = await board("overall");
    expect(overall.entries.map((e: any) => [e.user.id, e.value, e.rank])).toEqual([
      [b.id, 11, 1],
      [a.id, 8, 2],
    ]);
    expect(overall.me).toMatchObject({ rank: 2, value: 8 });
    const stealers = await board("stealers");
    expect(stealers.entries.map((e: any) => [e.user.id, e.value])).toEqual([
      [b.id, 6],
      [a.id, 2],
    ]);
    const losers = await board("losers");
    expect(losers.entries.map((e: any) => [e.user.id, e.value])).toEqual([
      [a.id, 6],
      [b.id, 2],
    ]);
    const gainers = await board("gainers");
    expect(gainers.entries.map((e: any) => [e.user.id, e.value])).toEqual([
      [b.id, 11],
      [a.id, 8],
    ]);
    const stranger = await t.device();
    const friendsOnly = await board("overall", stranger.token, "friends");
    expect(friendsOnly.entries).toEqual([]);
    expect(friendsOnly.me).toMatchObject({ rank: 1, value: 0 });
    expect((await t.req("GET", "/v1/territory/season?month=2026-13", { token: a.token })).status).toBe(400);
  });

  test("hidden users are left out of world season boards but shown to friends", async () => {
    const c = await t.device({ privacy: { hideFromLeaderboards: true } });
    await t.upload(c.token, cellsAround(40.0, -3.7, 3));
    const world = (await t.req("GET", "/v1/territory/season?board=overall", { token: b.token })).json;
    expect(ids(world.entries)).not.toContain(c.id);
    const own = (await t.req("GET", "/v1/territory/season?board=overall", { token: c.token })).json;
    expect(own.me).toMatchObject({ rank: 1, value: 37 });
    await t.req("POST", "/v1/friends/invite/" + (await t.req("GET", "/v1/me", { token: c.token })).json.inviteCode, { token: b.token });
    const friends = (await t.req("GET", "/v1/territory/season?board=overall&scope=friends", { token: b.token })).json;
    expect(ids(friends.entries)).toContain(c.id);
  });

  test("past month overall is reconstructed from events", async () => {
    const past = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 2, 10));
    await t.sql`update cell_events set at = ${past} where to_user = ${a.id} and kind = 'claim'`;
    const r = (await t.req("GET", `/v1/territory/season?board=overall&month=${month(past)}`, { token: a.token })).json;
    expect(r.entries.map((e: any) => [e.user.id, e.value])).toEqual([[a.id, 12]]);
    const stealers = (await t.req("GET", `/v1/territory/season?board=stealers&month=${month(past)}`, { token: a.token })).json;
    expect(stealers.entries).toEqual([]);
    const future = (await t.req("GET", `/v1/territory/season?board=overall&month=${new Date().getUTCFullYear() + 1}-01`, { token: a.token })).json;
    expect(future.entries).toEqual([]);
  });
});
