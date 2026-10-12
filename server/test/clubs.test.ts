import { describe, expect, test } from "bun:test";
import { cellsAround, setup } from "./helpers";

const t = await setup();

const create = async (token: string, body: Record<string, unknown>) => t.req("POST", "/v1/clubs", { token, body });
const mine = async (token: string) => (await t.req("GET", "/v1/clubs/mine", { token })).json.club;

describe("clubs", () => {
  test("create, join by code and public join", async () => {
    const owner = await t.device();
    const r = await create(owner.token, { name: "Autobahn Club", color: "#f59e0b", description: "Fast and friendly", isPublic: false });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ name: "Autobahn Club", color: "#F59E0B", isPublic: false, ownerId: owner.id, memberCount: 1, cellsHeld: 0 });
    expect(r.json.inviteCode).toHaveLength(8);
    const me = (await t.req("GET", "/v1/me", { token: owner.token })).json;
    expect(me.club).toEqual({ id: r.json.id, name: "Autobahn Club", color: "#F59E0B" });

    const b = await t.device();
    const blocked = await t.req("POST", `/v1/clubs/${r.json.id}/join`, { token: b.token });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error.code).toBe("private_club");
    const view = (await t.req("GET", `/v1/clubs/${r.json.id}`, { token: b.token })).json;
    expect(view.club.inviteCode).toBeUndefined();
    const joined = await t.req("POST", "/v1/clubs/join", { token: b.token, body: { code: r.json.inviteCode.toLowerCase() } });
    expect(joined.json).toMatchObject({ id: r.json.id, memberCount: 2 });
    expect(joined.json.inviteCode).toBe(r.json.inviteCode);
    expect((await t.req("POST", "/v1/clubs/join", { token: b.token, body: { code: "XXXXXXXX" } })).status).toBe(404);

    await t.upload(b.token, cellsAround(49.45, 11.08), { distanceM: 12_000 });
    const detail = (await t.req("GET", `/v1/clubs/${r.json.id}`, { token: owner.token })).json;
    expect(detail.club.cellsHeld).toBe(7);
    expect(detail.members.map((m: any) => [m.user.id, m.role, m.distanceM])).toEqual([
      [b.id, "member", 12_000],
      [owner.id, "owner", 0],
    ]);
  });

  test("one club per user: creating or joining leaves the previous club", async () => {
    const a = await t.device();
    const b = await t.device();
    const first = (await create(a.token, { name: "Club One", color: "#10B981", isPublic: true })).json;
    await t.req("POST", `/v1/clubs/${first.id}/join`, { token: b.token });
    const second = (await create(b.token, { name: "Club Two", color: "#3B82F6", isPublic: true })).json;
    expect((await mine(b.token)).id).toBe(second.id);
    expect((await t.req("GET", `/v1/clubs/${first.id}`, { token: a.token })).json.club.memberCount).toBe(1);
    await t.req("POST", `/v1/clubs/${second.id}/join`, { token: a.token });
    expect((await mine(a.token)).id).toBe(second.id);
    expect((await t.req("GET", `/v1/clubs/${first.id}`, { token: a.token })).status).toBe(404);
  });

  test("search lists public clubs only", async () => {
    const a = await t.device();
    const b = await t.device();
    await create(a.token, { name: "Alpine Cruisers", color: "#10B981", isPublic: true });
    await create(b.token, { name: "Alpine Secret", color: "#10B981", isPublic: false });
    const r = (await t.req("GET", "/v1/clubs/search?q=alpine", { token: a.token })).json;
    expect(r.items.map((c: any) => c.name)).toEqual(["Alpine Cruisers"]);
  });

  test("leave transfers ownership to the oldest member", async () => {
    const a = await t.device();
    const b = await t.device();
    const c = await t.device();
    const club = (await create(a.token, { name: "Transfer Club", color: "#10B981", isPublic: true })).json;
    await t.req("POST", `/v1/clubs/${club.id}/join`, { token: b.token });
    await t.req("POST", `/v1/clubs/${club.id}/join`, { token: c.token });
    expect((await t.req("POST", `/v1/clubs/${club.id}/leave`, { token: a.token })).json).toEqual({ ok: true });
    const after = (await t.req("GET", `/v1/clubs/${club.id}`, { token: b.token })).json;
    expect(after.club.ownerId).toBe(b.id);
    expect(after.members.find((m: any) => m.user.id === b.id).role).toBe("owner");
    expect((await t.req("POST", `/v1/clubs/${club.id}/leave`, { token: a.token })).status).toBe(404);
  });

  test("owner transfer on account deletion, deletion of an empty club", async () => {
    const a = await t.device();
    const b = await t.device();
    const club = (await create(a.token, { name: "Heir Club", color: "#10B981", isPublic: true })).json;
    await t.req("POST", `/v1/clubs/${club.id}/join`, { token: b.token });
    await t.req("DELETE", "/v1/me", { token: a.token });
    expect((await t.req("GET", `/v1/clubs/${club.id}`, { token: b.token })).json.club).toMatchObject({ ownerId: b.id, memberCount: 1 });
    await t.req("DELETE", "/v1/me", { token: b.token });
    expect((await t.sql`select 1 from clubs where id = ${club.id}`).length).toBe(0);
  });

  test("owner can patch, remove members and delete", async () => {
    const a = await t.device();
    const b = await t.device();
    const club = (await create(a.token, { name: "Owner Club", color: "#10B981", isPublic: true })).json;
    await t.req("POST", `/v1/clubs/${club.id}/join`, { token: b.token });
    await t.upload(b.token, cellsAround(50.94, 6.96));
    expect((await t.req("PATCH", `/v1/clubs/${club.id}`, { token: b.token, body: { name: "Hijack" } })).status).toBe(403);
    const patched = await t.req("PATCH", `/v1/clubs/${club.id}`, { token: a.token, body: { name: "Renamed Club", isPublic: false } });
    expect(patched.json).toMatchObject({ name: "Renamed Club", isPublic: false });
    expect((await t.req("DELETE", `/v1/clubs/${club.id}/members/${a.id}`, { token: a.token })).status).toBe(400);
    expect((await t.req("DELETE", `/v1/clubs/${club.id}/members/${b.id}`, { token: a.token })).json).toEqual({ ok: true });
    expect(await mine(b.token)).toBeNull();
    expect((await t.sql`select count(*)::int as n from cells where club_id = ${club.id}`)[0].n).toBe(0);
    expect((await t.req("DELETE", `/v1/clubs/${club.id}`, { token: b.token })).status).toBe(403);
    expect((await t.req("DELETE", `/v1/clubs/${club.id}`, { token: a.token })).json).toEqual({ ok: true });
    expect(await mine(a.token)).toBeNull();
  });

  test("validates input", async () => {
    const a = await t.device();
    expect((await create(a.token, { name: "X", color: "#10B981", isPublic: true })).status).toBe(400);
    expect((await create(a.token, { name: "Valid", color: "red", isPublic: true })).status).toBe(400);
    expect((await create(a.token, { name: "Valid", color: "#10B981" })).status).toBe(400);
    expect((await t.req("GET", "/v1/clubs/not-a-uuid", { token: a.token })).status).toBe(404);
  });
});
