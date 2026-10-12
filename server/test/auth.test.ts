import { describe, expect, test } from "bun:test";
import { setup } from "./helpers";

const t = await setup();

describe("health and config", () => {
  test("health checks the database", async () => {
    const r = await t.req("GET", "/health");
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });
  });

  test("config reports disabled mods without a key", async () => {
    const r = await t.req("GET", "/v1/config");
    expect(r.json).toEqual({ features: { aiMods: false }, modsPerDay: 3, h3Resolution: 9, season: String(new Date().getUTCFullYear()) });
  });

  test("unknown routes return the error shape", async () => {
    const r = await t.req("GET", "/v1/nope");
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("not_found");
  });

  test("CORS allows the website origin only", async () => {
    const ok = await t.req("OPTIONS", "/v1/auth/delete-with-recovery", {
      headers: { origin: "https://roadclaim.codext.de", "access-control-request-method": "POST" },
    });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://roadclaim.codext.de");
    const bad = await t.req("OPTIONS", "/v1/auth/delete-with-recovery", {
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("device auth", () => {
  test("creates an anonymous account", async () => {
    const r = await t.req("POST", "/v1/auth/device", { body: { platform: "android", locale: "de-DE" } });
    expect(r.status).toBe(200);
    expect(r.json.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.json.recoveryKey).toMatch(/^RC-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(r.json.me.username).toMatch(/^driver\d{4,6}$/);
    expect(r.json.me.privacy).toEqual({ localOnly: false, hideFromLeaderboards: false, cloudBackup: false });
    expect(r.json.me.inviteCode).toHaveLength(8);
    const [row] = await t.sql`select recovery_hash, recovery_enc from users where id = ${r.json.me.id}`;
    expect(row.recovery_hash).not.toContain(r.json.recoveryKey);
    const [tok] = await t.sql`select hash from tokens where user_id = ${r.json.me.id}`;
    expect(tok.hash).not.toBe(r.json.token);
  });

  test("rejects bad platform and malformed JSON", async () => {
    expect((await t.req("POST", "/v1/auth/device", { body: { platform: "web" } })).status).toBe(400);
    const r = await t.req("POST", "/v1/auth/device", { raw: "{", headers: { "content-type": "application/json" } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("invalid_request");
  });

  test("requires a valid token", async () => {
    expect((await t.req("GET", "/v1/me")).status).toBe(401);
    const r = await t.req("GET", "/v1/me", { token: "x".repeat(43) });
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe("unauthorized");
  });

  test("restore issues a new token and keeps the old one", async () => {
    const u = await t.device();
    const loose = u.recoveryKey.toLowerCase().replace(/-/g, " ").replace(/^rc /, "");
    const r = await t.req("POST", "/v1/auth/restore", { body: { recoveryKey: loose } });
    expect(r.status).toBe(200);
    expect(r.json.me.id).toBe(u.id);
    expect(r.json.token).not.toBe(u.token);
    expect((await t.req("GET", "/v1/me", { token: r.json.token })).json.id).toBe(u.id);
    expect((await t.req("GET", "/v1/me", { token: u.token })).json.id).toBe(u.id);
  });

  test("restore rejects unknown keys", async () => {
    const r = await t.req("POST", "/v1/auth/restore", { body: { recoveryKey: "RC-0000-0000-0000-0000" } });
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("invalid_recovery_key");
  });

  test("returns the recovery key to its owner", async () => {
    const u = await t.device();
    const r = await t.req("GET", "/v1/auth/recovery-key", { token: u.token });
    expect(r.json).toEqual({ recoveryKey: u.recoveryKey });
  });

  test("limits device signups per IP", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await t.req("POST", "/v1/auth/device", { body: { platform: "ios" }, ip: "203.0.113.9" })).status).toBe(200);
    }
    const r = await t.req("POST", "/v1/auth/device", { body: { platform: "ios" }, ip: "203.0.113.9" });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe("rate_limited");
    expect(r.headers.get("retry-after")).not.toBeNull();
    expect((await t.req("POST", "/v1/auth/device", { body: { platform: "ios" }, ip: "203.0.113.10" })).status).toBe(200);
  });
});

describe("delete with recovery key", () => {
  test("deletes the account from the website", async () => {
    const u = await t.device();
    const r = await t.req("POST", "/v1/auth/delete-with-recovery", {
      body: { recoveryKey: u.recoveryKey },
      headers: { origin: "https://roadclaim.codext.de" },
    });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });
    expect(r.headers.get("access-control-allow-origin")).toBe("https://roadclaim.codext.de");
    expect((await t.req("GET", "/v1/me", { token: u.token })).status).toBe(401);
    expect((await t.sql`select 1 from users where id = ${u.id}`).length).toBe(0);
  });

  test("rejects a wrong key", async () => {
    const r = await t.req("POST", "/v1/auth/delete-with-recovery", { body: { recoveryKey: "RC-ZZZZ-ZZZZ-ZZZZ-ZZZZ" } });
    expect(r.status).toBe(404);
  });
});
