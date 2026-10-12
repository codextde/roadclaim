import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../auth";
import { sign, verifySignature } from "../crypto";
import type { Sql } from "../db";
import { buildModPrompt, MOD_STYLES } from "../gemini";
import { ApiError, badRequest, idParam, notFound, parse, publicOrigin, type Ctx, type Env } from "../http";
import { log } from "../log";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ATTEMPT_FACTOR = 3;

const formSchema = z
  .object({
    style: z.enum(MOD_STYLES),
    prompt: z.string().trim().max(500).optional(),
    carLabel: z.string().trim().min(1).max(120),
    color: z.string().trim().max(40).optional(),
  })
  .refine((f) => f.style !== "custom" || !!f.prompt, { message: "prompt is required for the custom style", path: ["prompt"] });

const today = () => new Date().toISOString().slice(0, 10);

function imageUrl(c: Ctx, id: string): string {
  return `${publicOrigin(c)}/v1/mods/${id}/image?sig=${sign(c.var.deps.config.secretKey, `mod:${id}`)}`;
}

function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

const userLimitError = (perUser: number) =>
  new ApiError(429, "limit_reached", `You have used all ${perUser} car mods for today. Come back tomorrow.`);
const globalLimitError = () =>
  new ApiError(429, "global_limit", "Car mods are very popular today and the daily capacity is used up. Try again tomorrow.");

type Quota = { perUser: number; global: number };

async function usage(sql: Sql, userId: string) {
  const day = today();
  const [r] = await sql`
    select coalesce((select count from mod_usage where user_id = ${userId} and day = ${day}), 0)::int as mine,
           coalesce((select count from mod_usage_global where day = ${day}), 0)::int as total,
           coalesce((select count from mod_attempts where user_id = ${userId} and day = ${day}), 0)::int as mine_attempts,
           coalesce((select count from mod_attempts_global where day = ${day}), 0)::int as total_attempts`;
  return r as { mine: number; total: number; mine_attempts: number; total_attempts: number };
}

async function remaining(sql: Sql, userId: string, q: Quota): Promise<number> {
  const u = await usage(sql, userId);
  return Math.max(
    0,
    Math.min(q.perUser - u.mine, q.global - u.total, q.perUser * ATTEMPT_FACTOR - u.mine_attempts, q.global * ATTEMPT_FACTOR - u.total_attempts),
  );
}

async function precheck(sql: Sql, userId: string, q: Quota): Promise<void> {
  const u = await usage(sql, userId);
  if (u.mine >= q.perUser || u.mine_attempts >= q.perUser * ATTEMPT_FACTOR) throw userLimitError(q.perUser);
  if (u.total >= q.global || u.total_attempts >= q.global * ATTEMPT_FACTOR) throw globalLimitError();
}

async function reserve(sql: Sql, userId: string, q: Quota): Promise<void> {
  await sql.begin(async (tx) => {
    const day = today();
    const attempts = await tx`
      insert into mod_attempts (user_id, day, count) select ${userId}, ${day}, 1 where ${q.perUser * ATTEMPT_FACTOR} > 0
      on conflict (user_id, day) do update set count = mod_attempts.count + 1 where mod_attempts.count < ${q.perUser * ATTEMPT_FACTOR}
      returning count`;
    if (!attempts.length) throw userLimitError(q.perUser);
    const globalAttempts = await tx`
      insert into mod_attempts_global (day, count) select ${day}, 1 where ${q.global * ATTEMPT_FACTOR} > 0
      on conflict (day) do update set count = mod_attempts_global.count + 1 where mod_attempts_global.count < ${q.global * ATTEMPT_FACTOR}
      returning count`;
    if (!globalAttempts.length) throw globalLimitError();
    const mine = await tx`
      insert into mod_usage (user_id, day, count) select ${userId}, ${day}, 1 where ${q.perUser} > 0
      on conflict (user_id, day) do update set count = mod_usage.count + 1 where mod_usage.count < ${q.perUser}
      returning count`;
    if (!mine.length) throw userLimitError(q.perUser);
    const total = await tx`
      insert into mod_usage_global (day, count) select ${day}, 1 where ${q.global} > 0
      on conflict (day) do update set count = mod_usage_global.count + 1 where mod_usage_global.count < ${q.global}
      returning count`;
    if (!total.length) throw globalLimitError();
  });
}

async function release(sql: Sql, userId: string): Promise<void> {
  const day = today();
  await sql.begin(async (tx) => {
    await tx`update mod_usage set count = greatest(count - 1, 0) where user_id = ${userId} and day = ${day}`;
    await tx`update mod_usage_global set count = greatest(count - 1, 0) where day = ${day}`;
  });
}

export const modImageRoute = new Hono<Env>().get("/:id/image", async (c) => {
  const id = idParam(c);
  const sig = c.req.query("sig") ?? "";
  if (!verifySignature(c.var.deps.config.secretKey, `mod:${id}`, sig)) throw new ApiError(403, "invalid_signature", "Invalid image signature");
  const [row] = await c.var.deps.sql`select image, mime from mods where id = ${id}`;
  if (!row) throw notFound("Image");
  const bytes = new Uint8Array(row.image);
  const type = sniffImage(bytes);
  if (!type) throw notFound("Image");
  return c.body(bytes, 200, {
    "content-type": type,
    "x-content-type-options": "nosniff",
    "cache-control": "private, max-age=31536000, immutable",
  });
});

export const modRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .post("/", async (c) => {
    const { sql, config, generateImage } = c.var.deps;
    if (!generateImage) throw new ApiError(503, "disabled", "Car mods are not available on this server");
    const me = c.var.user.id;
    const quota = { perUser: config.modsPerDay, global: config.modsGlobalPerDay };
    await precheck(sql, me, quota);
    let form: Record<string, string | File>;
    try {
      form = (await c.req.parseBody()) as Record<string, string | File>;
    } catch {
      throw badRequest("Expected multipart/form-data");
    }
    const text = (k: string) => (typeof form[k] === "string" && form[k] !== "" ? (form[k] as string) : undefined);
    const f = parse(formSchema, { style: text("style"), prompt: text("prompt"), carLabel: text("carLabel"), color: text("color") });
    let photo: { mimeType: string; data: string } | undefined;
    const file = form.photo;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PHOTO_BYTES) throw new ApiError(413, "photo_too_large", "The photo must be 8 MB or smaller");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mimeType = sniffImage(bytes);
      if (!mimeType) throw badRequest("The photo must be a JPEG or PNG", "invalid_photo");
      photo = { mimeType, data: Buffer.from(bytes).toString("base64") };
    }
    await reserve(sql, me, quota);
    let image;
    try {
      image = await generateImage({
        prompt: buildModPrompt({ style: f.style, prompt: f.prompt, carLabel: f.carLabel, color: f.color, withPhoto: !!photo }),
        photo,
      });
      const type = sniffImage(image.data);
      if (!type) throw new Error(`unsupported image type ${image.mimeType}`);
      image = { mimeType: type, data: image.data };
    } catch (err) {
      await release(sql, me);
      log("error", "mod generation failed", { error: String(err) });
      throw new ApiError(502, "generation_failed", "The image could not be generated, please try again");
    }
    const [row] = await sql`
      insert into mods (user_id, style, prompt, car_label, color, image, mime)
      values (${me}, ${f.style}, ${f.prompt ?? ""}, ${f.carLabel}, ${f.color ?? null}, ${Buffer.from(image.data)}, ${image.mimeType})
      returning id, created_at`;
    return c.json({ id: row.id, imageUrl: imageUrl(c, row.id), createdAt: row.created_at.toISOString() }, 201);
  })
  .get("/", async (c) => {
    const { sql, config } = c.var.deps;
    const me = c.var.user.id;
    const rows = await sql`
      select id, style, prompt, car_label, created_at from mods where user_id = ${me} order by created_at desc limit 200`;
    return c.json({
      items: rows.map((r: any) => ({
        id: r.id,
        style: r.style,
        prompt: r.prompt,
        carLabel: r.car_label,
        imageUrl: imageUrl(c, r.id),
        createdAt: r.created_at.toISOString(),
      })),
      remainingToday: c.var.deps.generateImage ? await remaining(sql, me, { perUser: config.modsPerDay, global: config.modsGlobalPerDay }) : 0,
    });
  })
  .delete("/:id", async (c) => {
    const rows = await c.var.deps.sql`delete from mods where id = ${idParam(c)} and user_id = ${c.var.user.id} returning id`;
    if (!rows.length) throw notFound("Mod");
    return c.json({ ok: true });
  });
