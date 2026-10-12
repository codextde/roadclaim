import { describe, expect, test } from "bun:test";
import { cellsAround, setup } from "./helpers";

const t = await setup();

const friendIds = async (token: string) =>
  ((await t.req("GET", "/v1/friends", { token })).json.items as { id: string }[]).map((u) => u.id);

describe("friends", () => {
  test("request and accept", async () => {
    const a = await t.device();
    const b = await t.device();
    const sent = await t.req("POST", "/v1/friends/requests", { token: a.token, body: { userId: b.id } });
    expect(sent.status).toBe(200);
    const again = await t.req("POST", "/v1/friends/requests", { token: a.token, body: { userId: b.id } });
    expect(again.json.id).toBe(sent.json.id);

    const aReqs = (await t.req("GET", "/v1/friends/requests", { token: a.token })).json;
    expect(aReqs.outgoing.map((r: any) => r.user.id)).toEqual([b.id]);
    expect(aReqs.incoming).toEqual([]);
    const bReqs = (await t.req("GET", "/v1/friends/requests", { token: b.token })).json;
    expect(bReqs.incoming[0]).toMatchObject({ id: sent.json.id, user: { id: a.id } });

    const profile = (await t.req("GET", `/v1/users/${a.id}`, { token: b.token })).json;
    expect(profile).toMatchObject({ isFriend: false, requestPending: "in", user: { id: a.id } });
    expect(profile.trophies).toHaveLength(12);

    expect((await t.req("POST", `/v1/friends/requests/${sent.json.id}/accept`, { token: a.token })).status).toBe(404);
    expect((await t.req("POST", `/v1/friends/requests/${sent.json.id}/accept`, { token: b.token })).json).toEqual({ ok: true });
    expect(await friendIds(a.token)).toEqual([b.id]);
    expect(await friendIds(b.token)).toEqual([a.id]);
    expect((await t.req("GET", `/v1/users/${b.id}`, { token: a.token })).json).toMatchObject({ isFriend: true, requestPending: null });
    const dup = await t.req("POST", "/v1/friends/requests", { token: a.token, body: { userId: b.id } });
    expect(dup.status).toBe(409);
  });

  test("crossing requests auto-accept, decline removes", async () => {
    const a = await t.device();
    const b = await t.device();
    const c = await t.device();
    await t.req("POST", "/v1/friends/requests", { token: a.token, body: { userId: b.id } });
    await t.req("POST", "/v1/friends/requests", { token: b.token, body: { userId: a.id } });
    expect(await friendIds(a.token)).toEqual([b.id]);
    const r = await t.req("POST", "/v1/friends/requests", { token: c.token, body: { userId: a.id } });
    expect((await t.req("POST", `/v1/friends/requests/${r.json.id}/decline`, { token: a.token })).json).toEqual({ ok: true });
    expect((await t.req("GET", "/v1/friends/requests", { token: c.token })).json.outgoing).toEqual([]);
    expect((await t.req("POST", "/v1/friends/requests", { token: a.token, body: { userId: a.id } })).status).toBe(400);
  });

  test("invite code makes friends instantly", async () => {
    const a = await t.device({ displayName: "Anna" });
    const b = await t.device();
    const me = (await t.req("GET", "/v1/me", { token: a.token })).json;
    const r = await t.req("POST", `/v1/friends/invite/${me.inviteCode.toLowerCase()}`, { token: b.token });
    expect(r.json.friend).toMatchObject({ id: a.id, displayName: "Anna" });
    expect(await friendIds(a.token)).toEqual([b.id]);
    expect((await t.req("POST", `/v1/friends/invite/${me.inviteCode}`, { token: a.token })).status).toBe(400);
    expect((await t.req("POST", "/v1/friends/invite/NOPE1234", { token: b.token })).json.error.code).toBe("invalid_invite");
  });

  test("remove friend", async () => {
    const a = await t.device();
    const b = await t.device();
    await t.req("POST", `/v1/friends/invite/${(await t.req("GET", "/v1/me", { token: a.token })).json.inviteCode}`, { token: b.token });
    expect((await t.req("DELETE", `/v1/friends/${a.id}`, { token: b.token })).json).toEqual({ ok: true });
    expect(await friendIds(a.token)).toEqual([]);
    expect(await friendIds(b.token)).toEqual([]);
  });

  test("search by username or display name", async () => {
    const a = await t.device({ username: "speedy_sam", displayName: "Samuel" });
    const b = await t.device({ username: "samantha", displayName: "Sam" });
    await t.device({ username: "sam_local", privacy: { localOnly: true } });
    const viewer = await t.device();
    const r = await t.req("GET", "/v1/users/search?q=SAM", { token: viewer.token });
    expect(r.json.items.map((u: { id: string }) => u.id).sort()).toEqual([a.id, b.id].sort());
    expect((await t.req("GET", "/v1/users/search?q=%25", { token: viewer.token })).json.items).toEqual([]);
    expect((await t.req("GET", "/v1/users/search", { token: viewer.token })).status).toBe(400);
  });

  test("compare season stats", async () => {
    const a = await t.device();
    const b = await t.device();
    await t.upload(a.token, cellsAround(51.0, 7.0), { distanceM: 42_000 });
    const r = await t.req("GET", `/v1/compare/${a.id}`, { token: b.token });
    expect(r.json.user.id).toBe(a.id);
    expect(r.json.them).toMatchObject({ distanceM: 42_000, drives: 1, longestM: 42_000, cellsHeld: 7 });
    expect(r.json.me).toMatchObject({ distanceM: 0, drives: 0 });
    expect((await t.req("GET", "/v1/compare/00000000-0000-4000-8000-000000000000", { token: b.token })).status).toBe(404);
  });
});

describe("blocks and reports", () => {
  test("blocking hides users and prevents friend requests", async () => {
    const a = await t.device({ username: "blocker_bea" });
    const b = await t.device({ username: "blocked_ben" });
    await t.req("POST", `/v1/friends/invite/${(await t.req("GET", "/v1/me", { token: b.token })).json.inviteCode}`, { token: a.token });
    expect((await t.req("POST", "/v1/blocks", { token: a.token, body: { userId: b.id } })).json).toEqual({ ok: true });
    expect(await friendIds(a.token)).toEqual([]);
    expect((await t.req("GET", "/v1/blocks", { token: a.token })).json.items.map((u: any) => u.id)).toEqual([b.id]);
    expect((await t.req("GET", "/v1/users/search?q=blocked_", { token: a.token })).json.items).toEqual([]);
    expect((await t.req("GET", "/v1/users/search?q=blocker_", { token: b.token })).json.items).toEqual([]);

    const req = await t.req("POST", "/v1/friends/requests", { token: b.token, body: { userId: a.id } });
    expect(req.status).toBe(403);
    expect(req.json.error.code).toBe("blocked");
    const inv = await t.req("POST", `/v1/friends/invite/${(await t.req("GET", "/v1/me", { token: a.token })).json.inviteCode}`, { token: b.token });
    expect(inv.status).toBe(403);
    expect((await t.req("POST", "/v1/friends/requests", { token: a.token, body: { userId: b.id } })).status).toBe(403);

    const cells = cellsAround(45.46, 9.19);
    await t.upload(b.token, cells);
    const bbox = "45.4,9.1,45.5,9.25";
    const seen = (await t.req("GET", `/v1/territory/cells?bbox=${bbox}`, { token: a.token })).json.cells;
    expect(seen).toHaveLength(7);
    expect(seen.every((c: any) => c.owner === "other" && c.name === "")).toBe(true);

    expect((await t.req("DELETE", `/v1/blocks/${b.id}`, { token: a.token })).json).toEqual({ ok: true });
    expect((await t.req("GET", "/v1/users/search?q=blocked_", { token: a.token })).json.items).toHaveLength(1);
    expect((await t.req("POST", "/v1/blocks", { token: a.token, body: { userId: a.id } })).status).toBe(400);
  });

  test("reports are stored", async () => {
    const a = await t.device();
    const b = await t.device();
    const club = (await t.req("POST", "/v1/clubs", { token: b.token, body: { name: "Night Crew", color: "#000000", isPublic: true } })).json;
    expect((await t.req("POST", "/v1/reports", { token: a.token, body: { targetType: "user", targetId: b.id, reason: "name", note: "rude" } })).json).toEqual({ ok: true });
    expect((await t.req("POST", "/v1/reports", { token: a.token, body: { targetType: "club", targetId: club.id, reason: "spam" } })).status).toBe(200);
    expect((await t.req("POST", "/v1/reports", { token: a.token, body: { targetType: "user", targetId: b.id, reason: "ugly" } })).status).toBe(400);
    expect((await t.req("POST", "/v1/reports", { token: a.token, body: { targetType: "club", targetId: b.id, reason: "spam" } })).status).toBe(404);
    const rows = await t.sql`select target_type, reason, note from reports where reporter_id = ${a.id} order by created_at`;
    expect(rows.map((r: any) => [r.target_type, r.reason, r.note])).toEqual([
      ["user", "name", "rude"],
      ["club", "spam", null],
    ]);
  });

  test("names are moderated", async () => {
    const u = await t.device();
    for (const body of [{ username: "fuck_this" }, { displayName: "H1tl3r" }, { displayName: "Hurens0hn" }, { username: "big_dick" }]) {
      const r = await t.req("PATCH", "/v1/me", { token: u.token, body });
      expect(r.status).toBe(422);
      expect(r.json.error.code).toBe("inappropriate_name");
    }
    expect((await t.req("PATCH", "/v1/me", { token: u.token, body: { displayName: "Scunthorpe Essex" } })).status).toBe(200);
    const club = await t.req("POST", "/v1/clubs", { token: u.token, body: { name: "Sh1t Crew", color: "#000000", isPublic: true } });
    expect(club.status).toBe(422);
    const ok = (await t.req("POST", "/v1/clubs", { token: u.token, body: { name: "Cockpit Crew", color: "#000000", isPublic: true } })).json;
    const patch = await t.req("PATCH", `/v1/clubs/${ok.id}`, { token: u.token, body: { description: "wir sind alle Wichser" } });
    expect(patch.status).toBe(422);
  });
});
