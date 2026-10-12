import { describe, expect, test } from "bun:test";
import { buildModPrompt, geminiGenerator, type ImageInput } from "../src/gemini";
import { setup } from "./helpers";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const calls: ImageInput[] = [];
let fail = false;

const t = await setup({
  config: { geminiApiKey: "test", modsPerDay: 3, modsGlobalPerDay: 5 },
  generateImage: async (input) => {
    calls.push(input);
    if (fail) throw new Error("upstream down");
    return { mimeType: "image/png", data: png };
  },
});

function form(fields: Record<string, string | Blob>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const createMod = (token: string, fields: Record<string, string | Blob>) => t.req("POST", "/v1/mods", { token, raw: form(fields) });

describe("ai car mods", () => {
  test("config advertises the feature", async () => {
    expect((await t.req("GET", "/v1/config")).json).toMatchObject({ features: { aiMods: true }, modsPerDay: 3 });
  });

  test("generates, lists, serves signed images and deletes", async () => {
    const u = await t.device();
    const r = await createMod(u.token, { style: "widebody", carLabel: "Porsche 911 (992)", color: "Guards Red" });
    expect(r.status).toBe(201);
    expect(r.json.imageUrl).toMatch(new RegExp(`^https://api\\.test/v1/mods/${r.json.id}/image\\?sig=[A-Za-z0-9_-]+$`));
    expect(calls.at(-1)!.prompt).toContain("Guards Red Porsche 911 (992)");
    expect(calls.at(-1)!.prompt).toContain("widebody");
    expect(calls.at(-1)!.photo).toBeUndefined();

    const path = new URL(r.json.imageUrl).pathname + new URL(r.json.imageUrl).search;
    const img = await t.app.fetch(new Request(`http://localhost${path}`));
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(png);
    const forged = await t.req("GET", `/v1/mods/${r.json.id}/image?sig=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`);
    expect(forged.status).toBe(403);

    const list = (await t.req("GET", "/v1/mods", { token: u.token })).json;
    expect(list.remainingToday).toBe(2);
    expect(list.items[0]).toMatchObject({ id: r.json.id, style: "widebody", prompt: "", carLabel: "Porsche 911 (992)" });

    expect((await t.req("DELETE", `/v1/mods/${r.json.id}`, { token: u.token })).json).toEqual({ ok: true });
    expect((await t.req("GET", "/v1/mods", { token: u.token })).json).toEqual({ items: [], remainingToday: 2 });
    expect((await t.app.fetch(new Request(`http://localhost${path}`))).status).toBe(404);
  });

  test("photo mode and custom prompts", async () => {
    const u = await t.device();
    const photo = new File([jpeg], "car.jpg", { type: "image/jpeg" });
    const r = await createMod(u.token, { style: "custom", prompt: "pastel blue with gold wheels", carLabel: "Mazda MX-5", photo });
    expect(r.status).toBe(201);
    const call = calls.at(-1)!;
    expect(call.photo).toEqual({ mimeType: "image/jpeg", data: Buffer.from(jpeg).toString("base64") });
    expect(call.prompt).toContain("Modify this exact car");
    expect(call.prompt).toContain("pastel blue with gold wheels");
    const noPrompt = await createMod(u.token, { style: "custom", carLabel: "Mazda MX-5" });
    expect(noPrompt.status).toBe(400);
    const badStyle = await createMod(u.token, { style: "flames", carLabel: "Mazda MX-5" });
    expect(badStyle.status).toBe(400);
    const badPhoto = await createMod(u.token, { style: "stance", carLabel: "Mazda MX-5", photo: new File(["hello"], "x.gif") });
    expect(badPhoto.json.error.code).toBe("invalid_photo");
    const big = new Uint8Array(8 * 1024 * 1024 + 10);
    big.set(jpeg);
    const tooBig = await createMod(u.token, { style: "stance", carLabel: "Mazda MX-5", photo: new File([big], "big.jpg") });
    expect(tooBig.status).toBe(413);
  });

  test("failed generations do not count", async () => {
    const u = await t.device();
    fail = true;
    const r = await createMod(u.token, { style: "rally", carLabel: "Subaru Impreza" });
    fail = false;
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe("generation_failed");
    expect((await t.req("GET", "/v1/mods", { token: u.token })).json.remainingToday).toBe(3);
  });

  test("per-user daily limit, then the global cap", async () => {
    const a = await t.device();
    for (let i = 0; i < 3; i++) expect((await createMod(a.token, { style: "track", carLabel: "BMW M2" })).status).toBe(201);
    const limited = await createMod(a.token, { style: "track", carLabel: "BMW M2" });
    expect(limited.status).toBe(429);
    expect(limited.json.error.code).toBe("limit_reached");
    expect((await t.req("GET", "/v1/mods", { token: a.token })).json.remainingToday).toBe(0);

    const b = await t.device();
    const before = (await t.req("GET", "/v1/mods", { token: b.token })).json.remainingToday;
    expect(before).toBe(0);
    const capped = await createMod(b.token, { style: "track", carLabel: "BMW M2" });
    expect(capped.status).toBe(429);
    expect(capped.json.error.code).toBe("global_limit");
    expect(capped.json.error.message).toContain("Try again tomorrow");
    expect((await t.req("GET", "/v1/config")).json.features.aiMods).toBe(true);
    const [usage] = await t.sql`select count from mod_usage where user_id = ${b.id}`;
    expect(usage).toBeUndefined();
  });

  test("disabled without an API key", async () => {
    const off = await setup();
    const u = await off.device();
    const r = await off.req("POST", "/v1/mods", { token: u.token, raw: form({ style: "retro", carLabel: "VW Beetle" }) });
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe("disabled");
    expect((await off.req("GET", "/v1/config")).json.features.aiMods).toBe(false);
  });
});

describe("gemini client", () => {
  test("sends the documented request and decodes the image", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return Response.json({
        candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { mimeType: "image/png", data: Buffer.from(png).toString("base64") } }] } }],
      });
    }) as unknown as typeof fetch;
    const gen = geminiGenerator("k-123", "gemini-2.5-flash-image", fakeFetch);
    const out = await gen({ prompt: "p", photo: { mimeType: "image/jpeg", data: "AAA=" } });
    expect(out).toEqual({ mimeType: "image/png", data: Buffer.from(png) });
    expect(seen!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent");
    expect((seen!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k-123");
    expect(JSON.parse(seen!.init.body as string)).toEqual({
      contents: [{ parts: [{ text: "p" }, { inlineData: { mimeType: "image/jpeg", data: "AAA=" } }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } },
    });
    const empty = geminiGenerator("k", "m", (async () => Response.json({ candidates: [] })) as unknown as typeof fetch);
    await expect(empty({ prompt: "p" })).rejects.toThrow("no image");
  });

  test("every preset produces a specific prompt", () => {
    for (const style of ["widebody", "stance", "rally", "track", "matte_wrap", "chrome_delete", "offroad", "retro"] as const) {
      const p = buildModPrompt({ style, carLabel: "Audi A4", color: "black", withPhoto: false });
      expect(p).toContain("black Audi A4");
      expect(p.length).toBeGreaterThan(200);
    }
  });
});
