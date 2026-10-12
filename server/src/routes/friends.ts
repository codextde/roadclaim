import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../auth";
import type { Sql } from "../db";
import { ApiError, badRequest, idParam, jsonBody, notFound, parse, uuid, type Env } from "../http";
import { userStats } from "../stats";
import { listTrophies } from "../trophies";
import { areFriends, blockedWith, publicUser, publicUsers, visibleTo, type PublicUser } from "../users";

async function befriend(tx: Sql, a: string, b: string): Promise<void> {
  await tx`insert into friendships (user_id, friend_id) values (${a}, ${b}), (${b}, ${a}) on conflict do nothing`;
  await tx`delete from friend_requests where (from_id = ${a} and to_id = ${b}) or (from_id = ${b} and to_id = ${a})`;
}

async function assertNotBlocked(sql: Sql, a: string, b: string): Promise<void> {
  const [r] = await sql`
    select 1 from blocks where (blocker_id = ${a} and blocked_id = ${b}) or (blocker_id = ${b} and blocked_id = ${a})`;
  if (r) throw new ApiError(403, "blocked", "You cannot add this user");
}

async function requireUser(sql: Sql, id: string, viewer?: string): Promise<PublicUser> {
  if (viewer && !(await visibleTo(sql, viewer, id))) throw notFound("User");
  const user = await publicUser(sql, id);
  if (!user) throw notFound("User");
  return user;
}

export const userRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .get("/search", async (c) => {
    const q = parse(z.string().trim().min(1).max(40), c.req.query("q") ?? "").toLowerCase();
    const pattern = `${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const { sql } = c.var.deps;
    const rows = await sql`
      select id from users
      where id <> ${c.var.user.id} and local_only = false
        and id not in (${blockedWith(sql, c.var.user.id)})
        and (lower(username) like ${pattern} or lower(display_name) like ${pattern})
      order by lower(username) = ${q} desc, username limit 20`;
    const users = await publicUsers(sql, rows.map((r: { id: string }) => r.id));
    return c.json({ items: rows.map((r: { id: string }) => users.get(r.id)).filter(Boolean) });
  })
  .get("/:id", async (c) => {
    const { sql } = c.var.deps;
    const id = idParam(c);
    const me = c.var.user.id;
    const user = await requireUser(sql, id, me);
    const [req] = await sql`
      select case when from_id = ${me} then 'out' else 'in' end as dir from friend_requests
      where (from_id = ${me} and to_id = ${id}) or (from_id = ${id} and to_id = ${me}) limit 1`;
    return c.json({
      user,
      stats: await userStats(sql, id, "season"),
      trophies: await listTrophies(sql, id),
      isFriend: await areFriends(sql, me, id),
      requestPending: (req?.dir as "in" | "out" | undefined) ?? null,
    });
  });

export const compareRoutes = new Hono<Env>().use("*", requireAuth).get("/:userId", async (c) => {
  const { sql } = c.var.deps;
  const id = idParam(c, "userId");
  const user = await requireUser(sql, id, c.var.user.id);
  const [me, them] = await Promise.all([userStats(sql, c.var.user.id, "season"), userStats(sql, id, "season")]);
  return c.json({ me, them, user });
});

export const friendRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .get("/", async (c) => {
    const { sql } = c.var.deps;
    const rows = await sql`
      select f.friend_id from friendships f join users u on u.id = f.friend_id
      where f.user_id = ${c.var.user.id} order by lower(u.display_name)`;
    const users = await publicUsers(sql, rows.map((r: { friend_id: string }) => r.friend_id));
    return c.json({ items: rows.map((r: { friend_id: string }) => users.get(r.friend_id)) });
  })
  .get("/requests", async (c) => {
    const { sql } = c.var.deps;
    const me = c.var.user.id;
    const rows = await sql`
      select id, from_id, to_id, created_at from friend_requests
      where from_id = ${me} or to_id = ${me} order by created_at desc`;
    const users = await publicUsers(sql, rows.map((r: any) => (r.from_id === me ? r.to_id : r.from_id)));
    const item = (r: any, other: string) => ({ id: r.id, user: users.get(other), createdAt: r.created_at.toISOString() });
    return c.json({
      incoming: rows.filter((r: any) => r.to_id === me).map((r: any) => item(r, r.from_id)),
      outgoing: rows.filter((r: any) => r.from_id === me).map((r: any) => item(r, r.to_id)),
    });
  })
  .post("/requests", async (c) => {
    const { userId } = await jsonBody(c, z.object({ userId: uuid }));
    const target = userId.toLowerCase();
    const me = c.var.user.id;
    if (target === me) throw badRequest("You cannot befriend yourself");
    const { sql } = c.var.deps;
    await requireUser(sql, target);
    await assertNotBlocked(sql, me, target);
    const id = await sql.begin(async (tx) => {
      if (await areFriends(tx, me, target)) throw new ApiError(409, "already_friends", "You are already friends");
      const [reverse] = await tx`select id from friend_requests where from_id = ${target} and to_id = ${me}`;
      if (reverse) {
        await befriend(tx, me, target);
        return reverse.id as string;
      }
      const [row] = await tx`
        insert into friend_requests (from_id, to_id) values (${me}, ${target})
        on conflict (from_id, to_id) do update set from_id = excluded.from_id
        returning id`;
      return row.id as string;
    });
    return c.json({ id });
  })
  .post("/requests/:id/accept", async (c) => {
    const { sql } = c.var.deps;
    const id = idParam(c);
    await sql.begin(async (tx) => {
      const [r] = await tx`select from_id from friend_requests where id = ${id} and to_id = ${c.var.user.id}`;
      if (!r) throw notFound("Friend request");
      await befriend(tx, c.var.user.id, r.from_id);
    });
    return c.json({ ok: true });
  })
  .post("/requests/:id/decline", async (c) => {
    const me = c.var.user.id;
    const rows = await c.var.deps.sql`
      delete from friend_requests where id = ${idParam(c)} and (to_id = ${me} or from_id = ${me}) returning id`;
    if (!rows.length) throw notFound("Friend request");
    return c.json({ ok: true });
  })
  .post("/invite/:code", async (c) => {
    const { sql } = c.var.deps;
    const code = c.req.param("code").trim().toUpperCase();
    const [target] = await sql`select id from users where invite_code = ${code}`;
    if (!target) throw new ApiError(404, "invalid_invite", "This invite link is not valid");
    if (target.id === c.var.user.id) throw badRequest("This is your own invite link", "own_invite");
    await assertNotBlocked(sql, c.var.user.id, target.id);
    await sql.begin((tx) => befriend(tx, c.var.user.id, target.id));
    return c.json({ friend: await publicUser(sql, target.id) });
  })
  .delete("/:userId", async (c) => {
    const me = c.var.user.id;
    const other = idParam(c, "userId");
    await c.var.deps.sql`
      delete from friendships where (user_id = ${me} and friend_id = ${other}) or (user_id = ${other} and friend_id = ${me})`;
    return c.json({ ok: true });
  });
