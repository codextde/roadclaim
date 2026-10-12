import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../auth";
import { badRequest, idParam, jsonBody, notFound, uuid, type Env } from "../http";
import { publicUsers } from "../users";

const reportSchema = z.object({
  targetType: z.enum(["user", "club"]),
  targetId: uuid,
  reason: z.enum(["name", "spam", "cheating", "other"]),
  note: z.string().trim().max(1000).optional(),
});

export const reportRoutes = new Hono<Env>().use("*", requireAuth).post("/", async (c) => {
  const r = await jsonBody(c, reportSchema);
  const { sql } = c.var.deps;
  const id = r.targetId.toLowerCase();
  const [exists] =
    r.targetType === "user" ? await sql`select 1 from users where id = ${id}` : await sql`select 1 from clubs where id = ${id}`;
  if (!exists) throw notFound(r.targetType === "user" ? "User" : "Club");
  await sql`
    insert into reports (reporter_id, target_type, target_id, reason, note)
    values (${c.var.user.id}, ${r.targetType}, ${id}, ${r.reason}, ${r.note || null})`;
  return c.json({ ok: true });
});

export const blockRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .get("/", async (c) => {
    const { sql } = c.var.deps;
    const rows = await sql`select blocked_id from blocks where blocker_id = ${c.var.user.id} order by created_at desc`;
    const users = await publicUsers(sql, rows.map((r: { blocked_id: string }) => r.blocked_id));
    return c.json({ items: rows.map((r: { blocked_id: string }) => users.get(r.blocked_id)).filter(Boolean) });
  })
  .post("/", async (c) => {
    const { userId } = await jsonBody(c, z.object({ userId: uuid }));
    const me = c.var.user.id;
    const target = userId.toLowerCase();
    if (target === me) throw badRequest("You cannot block yourself");
    const { sql } = c.var.deps;
    await sql.begin(async (tx) => {
      const [u] = await tx`select 1 from users where id = ${target}`;
      if (!u) throw notFound("User");
      await tx`insert into blocks (blocker_id, blocked_id) values (${me}, ${target}) on conflict do nothing`;
      await tx`delete from friendships where (user_id = ${me} and friend_id = ${target}) or (user_id = ${target} and friend_id = ${me})`;
      await tx`delete from friend_requests where (from_id = ${me} and to_id = ${target}) or (from_id = ${target} and to_id = ${me})`;
    });
    return c.json({ ok: true });
  })
  .delete("/:userId", async (c) => {
    await c.var.deps.sql`delete from blocks where blocker_id = ${c.var.user.id} and blocked_id = ${idParam(c, "userId")}`;
    return c.json({ ok: true });
  });
