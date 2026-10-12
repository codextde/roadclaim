import { describe, expect, test } from "bun:test";
import { setup } from "./helpers";

const t = await setup();

describe("cloud backup", () => {
  test("requires the privacy opt-in", async () => {
    const u = await t.device();
    const r = await t.req("PUT", "/v1/backup/drives/abc", { token: u.token, raw: "{}" });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("backup_disabled");
  });

  test("put, list, get, delete", async () => {
    const u = await t.device({ privacy: { cloudBackup: true } });
    const drive = JSON.stringify({ id: "abc", points: [{ t: 1, lat: 48.1, lng: 11.5 }], z: "ü" });
    expect((await t.req("PUT", "/v1/backup/drives/abc", { token: u.token, raw: drive })).json).toEqual({ ok: true });
    await t.req("PUT", "/v1/backup/drives/def", { token: u.token, raw: "[1,2,3]" });
    const updated = JSON.stringify({ id: "abc", points: [] });
    await t.req("PUT", "/v1/backup/drives/abc", { token: u.token, raw: updated });

    const list = (await t.req("GET", "/v1/backup/drives", { token: u.token })).json.items;
    expect(list.map((i: any) => i.id).sort()).toEqual(["abc", "def"]);
    expect(list.find((i: any) => i.id === "abc").size).toBe(Buffer.byteLength(updated));
    expect(list[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const got = await t.req("GET", "/v1/backup/drives/abc", { token: u.token });
    expect(got.text).toBe(updated);
    expect(got.headers.get("content-type")).toContain("application/json");

    const other = await t.device({ privacy: { cloudBackup: true } });
    expect((await t.req("GET", "/v1/backup/drives/abc", { token: other.token })).status).toBe(404);

    expect((await t.req("DELETE", "/v1/backup/drives/abc", { token: u.token })).json).toEqual({ ok: true });
    expect((await t.req("GET", "/v1/backup/drives/abc", { token: u.token })).status).toBe(404);
  });

  test("validates size and JSON", async () => {
    const u = await t.device({ privacy: { cloudBackup: true } });
    expect((await t.req("PUT", "/v1/backup/drives/x", { token: u.token, raw: "not json" })).status).toBe(400);
    const big = JSON.stringify({ pad: "x".repeat(5 * 1024 * 1024) });
    expect((await t.req("PUT", "/v1/backup/drives/x", { token: u.token, raw: big })).status).toBe(413);
    const ok = JSON.stringify({ pad: "x".repeat(4 * 1024 * 1024) });
    expect((await t.req("PUT", "/v1/backup/drives/x", { token: u.token, raw: ok })).status).toBe(200);
    expect((await t.req("PUT", "/v1/backup/drives/bad%20id", { token: u.token, raw: "{}" })).status).toBe(404);
  });

  test("turning backup off deletes stored backups", async () => {
    const u = await t.device({ privacy: { cloudBackup: true } });
    await t.req("PUT", "/v1/backup/drives/a1", { token: u.token, raw: "{}" });
    await t.req("PATCH", "/v1/me", { token: u.token, body: { privacy: { cloudBackup: false } } });
    expect((await t.req("GET", "/v1/backup/drives", { token: u.token })).json.items).toEqual([]);
  });
});
