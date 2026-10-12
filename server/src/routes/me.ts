import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../auth";
import { deleteAccount } from "../clubs";
import { isUniqueViolation } from "../db";
import { ApiError, assertClean, hexColor, jsonBody, parse, type Env } from "../http";
import { periodSchema, userStats } from "../stats";
import { loadMe } from "../users";

const text = (max: number) => z.string().trim().min(1).max(max);

const patchSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,20}$/, "username must be 3-20 characters of a-z, 0-9, _ and ."),
  displayName: text(40),
  avatarColor: hexColor,
  car: z.object({ id: text(80), label: text(120), color: text(40).optional() }).nullable(),
  homeCity: text(100).nullable(),
  homeCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "homeCountry must be an ISO 3166-1 alpha-2 code")
    .nullable(),
  privacy: z
    .object({ localOnly: z.boolean(), hideFromLeaderboards: z.boolean(), cloudBackup: z.boolean() })
    .partial()
    .strict(),
}).partial().strict();

export const meRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .get("/", async (c) => c.json(await loadMe(c.var.deps.sql, c.var.user.id)))
  .patch("/", async (c) => {
    const p = await jsonBody(c, patchSchema);
    assertClean(p.username, p.displayName);
    const { sql } = c.var.deps;
    const id = c.var.user.id;
    const cols: Record<string, unknown> = {};
    if (p.username !== undefined) cols.username = p.username;
    if (p.displayName !== undefined) cols.display_name = p.displayName;
    if (p.avatarColor !== undefined) cols.avatar_color = p.avatarColor.toUpperCase();
    if (p.car !== undefined) cols.car = p.car;
    if (p.homeCity !== undefined) cols.home_city = p.homeCity;
    if (p.homeCountry !== undefined) cols.home_country = p.homeCountry;
    if (p.privacy?.localOnly !== undefined) cols.local_only = p.privacy.localOnly;
    if (p.privacy?.hideFromLeaderboards !== undefined) cols.hide_from_leaderboards = p.privacy.hideFromLeaderboards;
    if (p.privacy?.cloudBackup !== undefined) cols.cloud_backup = p.privacy.cloudBackup;
    if (Object.keys(cols).length) {
      try {
        await sql.begin(async (tx) => {
          await tx`update users set ${tx(cols)} where id = ${id}`;
          if (p.privacy?.cloudBackup === false) await tx`delete from backups where user_id = ${id}`;
        });
      } catch (err) {
        if (isUniqueViolation(err, "users_username_key")) throw new ApiError(409, "username_taken", "This username is taken");
        throw err;
      }
    }
    return c.json(await loadMe(sql, id));
  })
  .delete("/", async (c) => {
    await deleteAccount(c.var.deps.sql, c.var.user.id);
    return c.json({ ok: true });
  })
  .get("/stats", async (c) => {
    const period = parse(periodSchema.default("season"), c.req.query("period"));
    return c.json(await userStats(c.var.deps.sql, c.var.user.id, period));
  });
