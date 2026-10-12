import { describe, expect, test } from "bun:test";
import { cellsAround, setup } from "./helpers";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const t = await setup({ config: { geminiApiKey: "test" }, generateImage: async () => ({ mimeType: "image/png", data: png }) });

const count = async (table: string, column: string, id: string) =>
  (await t.sql.unsafe(`select count(*)::int as n from ${table} where ${column} = $1`, [id]))[0].n as number;

describe("account deletion", () => {
  test("cascades everything", async () => {
    const u = await t.device({ privacy: { cloudBackup: true } });
    const friend = await t.device();
    const rival = await t.device();
    const member = await t.device();
    const area = cellsAround(43.77, 11.25, 2);
    await t.upload(u.token, area);
    await t.upload(rival.token, area.slice(0, 5));
    await t.upload(u.token, area.slice(0, 3));
    await t.req("POST", `/v1/friends/invite/${(await t.req("GET", "/v1/me", { token: friend.token })).json.inviteCode}`, { token: u.token });
    await t.req("POST", "/v1/friends/requests", { token: u.token, body: { userId: rival.id } });
    const club = (await t.req("POST", "/v1/clubs", { token: u.token, body: { name: "Doomed Owner", color: "#10B981", isPublic: true } })).json;
    await t.req("POST", `/v1/clubs/${club.id}/join`, { token: member.token });
    const soloClub = await t.device();
    await t.req("POST", "/v1/blocks", { token: u.token, body: { userId: soloClub.id } });
    const form = new FormData();
    form.set("style", "rally");
    form.set("carLabel", "VW Golf");
    expect((await t.req("POST", "/v1/mods", { token: u.token, raw: form })).status).toBe(201);
    await t.req("PUT", "/v1/backup/drives/d1", { token: u.token, raw: JSON.stringify({ points: [1, 2] }) });
    expect(await count("cells", "owner_id", u.id)).toBe(19 - 2);

    const r = await t.req("DELETE", "/v1/me", { token: u.token });
    expect(r.json).toEqual({ ok: true });

    for (const [table, column] of [
      ["users", "id"],
      ["tokens", "user_id"],
      ["drives", "user_id"],
      ["cells", "owner_id"],
      ["cell_events", "to_user"],
      ["cell_events", "from_user"],
      ["user_cells_ever", "user_id"],
      ["friendships", "user_id"],
      ["friendships", "friend_id"],
      ["friend_requests", "from_id"],
      ["club_members", "user_id"],
      ["mods", "user_id"],
      ["mod_usage", "user_id"],
      ["backups", "user_id"],
      ["user_trophies", "user_id"],
      ["trophy_awards", "user_id"],
      ["blocks", "blocker_id"],
    ] as const) {
      expect(`${table}.${column}=${await count(table, column, u.id)}`).toBe(`${table}.${column}=0`);
    }
    expect((await t.req("GET", "/v1/me", { token: u.token })).status).toBe(401);
    expect((await t.req("GET", `/v1/clubs/${club.id}`, { token: member.token })).json.club).toMatchObject({ ownerId: member.id, memberCount: 1 });
    expect(await count("cells", "owner_id", rival.id)).toBe(2);
    expect((await t.req("GET", "/v1/friends", { token: friend.token })).json.items).toEqual([]);
    const stealers = (await t.req("GET", "/v1/territory/season?board=stealers", { token: rival.token })).json;
    expect(stealers.entries.map((e: any) => [e.user.id, e.value])).toEqual([[rival.id, 5]]);
  });
});
