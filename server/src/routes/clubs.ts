import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../auth";
import { joinClub, leaveClub, loadClub, loadClubs, type Club } from "../clubs";
import { randomCode } from "../crypto";
import type { Sql } from "../db";
import { ApiError, assertClean, forbidden, hexColor, idParam, jsonBody, notFound, parse, type Ctx, type Env } from "../http";
import { periodStart } from "../stats";
import { evaluateTrophies } from "../trophies";
import { blockedWith, publicUsers } from "../users";

const clubFields = {
  name: z.string().trim().min(2).max(40),
  color: hexColor,
  description: z.string().trim().max(280),
  isPublic: z.boolean(),
};
const createSchema = z.object({ ...clubFields, description: clubFields.description.optional() });
const patchSchema = z.object(clubFields).partial().strict();

async function clubOr404(sql: Sql, id: string, viewer: string): Promise<Club> {
  const club = await loadClub(sql, id, viewer);
  if (!club) throw notFound("Club");
  return club;
}

async function requireOwner(c: Ctx): Promise<string> {
  const id = idParam(c);
  const [club] = await c.var.deps.sql`select owner_id from clubs where id = ${id}`;
  if (!club) throw notFound("Club");
  if (club.owner_id !== c.var.user.id) throw forbidden("not_owner", "Only the club owner can do this");
  return id;
}

async function join(c: Ctx, clubId: string): Promise<Response> {
  const { sql } = c.var.deps;
  const me = c.var.user.id;
  await sql.begin(async (tx) => {
    const [current] = await tx`select club_id from club_members where user_id = ${me}`;
    if (current?.club_id === clubId) return;
    await joinClub(tx, me, clubId, "member");
    await evaluateTrophies(tx, me);
  });
  return c.json(await clubOr404(sql, clubId, me));
}

export const clubRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .post("/", async (c) => {
    const body = await jsonBody(c, createSchema);
    assertClean(body.name, body.description);
    const { sql } = c.var.deps;
    const me = c.var.user.id;
    const id = await sql.begin(async (tx) => {
      const [club] = await tx`
        insert into clubs (name, color, description, is_public, owner_id, invite_code)
        values (${body.name}, ${body.color.toUpperCase()}, ${body.description ?? ""}, ${body.isPublic}, ${me}, ${randomCode(8)})
        returning id`;
      await joinClub(tx, me, club.id, "owner");
      await evaluateTrophies(tx, me);
      return club.id as string;
    });
    return c.json(await clubOr404(sql, id, me), 201);
  })
  .get("/mine", async (c) => {
    const { sql } = c.var.deps;
    const [m] = await sql`select club_id from club_members where user_id = ${c.var.user.id}`;
    return c.json({ club: m ? await loadClub(sql, m.club_id, c.var.user.id) : null });
  })
  .get("/search", async (c) => {
    const q = parse(z.string().trim().max(40), c.req.query("q") ?? "").toLowerCase();
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const { sql } = c.var.deps;
    const rows = await sql`
      select c.id from clubs c where c.is_public and lower(c.name) like ${pattern}
      order by lower(c.name) like ${`${q}%`} desc, (select count(*) from club_members m where m.club_id = c.id) desc, c.name
      limit 20`;
    const clubs = await loadClubs(sql, rows.map((r: { id: string }) => r.id), c.var.user.id);
    return c.json({ items: rows.map((r: { id: string }) => clubs.get(r.id)) });
  })
  .post("/join", async (c) => {
    const { code } = await jsonBody(c, z.object({ code: z.string().trim().min(4).max(20) }));
    const [club] = await c.var.deps.sql`select id from clubs where invite_code = ${code.toUpperCase()}`;
    if (!club) throw new ApiError(404, "invalid_invite", "This club invite code is not valid");
    return join(c, club.id);
  })
  .get("/:id", async (c) => {
    const { sql } = c.var.deps;
    const id = idParam(c);
    const me = c.var.user.id;
    const club = await clubOr404(sql, id, me);
    if (!club.isPublic && club.inviteCode === undefined) throw notFound("Club");
    const rows = await sql`
      select m.user_id, m.role, u.local_only, u.hide_from_leaderboards,
        (m.user_id = ${me} or exists(select 1 from friendships f where f.user_id = ${me} and f.friend_id = m.user_id)) as close,
        coalesce(sum(d.distance_m), 0)::float8 as distance_m
      from club_members m join users u on u.id = m.user_id
      left join drives d on d.user_id = m.user_id and d.started_at >= ${periodStart("season")}
      where m.club_id = ${id} and m.user_id not in (${blockedWith(sql, me)})
      group by m.user_id, m.role, m.joined_at, u.local_only, u.hide_from_leaderboards
      order by distance_m desc, m.joined_at`;
    const shown = rows.filter((r: any) => r.close || !r.local_only);
    const users = await publicUsers(sql, shown.map((r: { user_id: string }) => r.user_id));
    const members = shown.map((r: any) => ({
      user: users.get(r.user_id),
      role: r.role,
      distanceM: (r.close || !r.hide_from_leaderboards ? r.distance_m : null) as number | null,
    }));
    members.sort((x: { distanceM: number | null }, y: { distanceM: number | null }) => (y.distanceM ?? -1) - (x.distanceM ?? -1));
    return c.json({ club, members });
  })
  .post("/:id/join", async (c) => {
    const id = idParam(c);
    const [club] = await c.var.deps.sql`select is_public from clubs where id = ${id}`;
    if (!club) throw notFound("Club");
    const [member] = await c.var.deps.sql`select 1 from club_members where user_id = ${c.var.user.id} and club_id = ${id}`;
    if (!club.is_public && !member) throw forbidden("private_club", "This club is private, join it with an invite code");
    return join(c, id);
  })
  .post("/:id/leave", async (c) => {
    const id = idParam(c);
    const { sql } = c.var.deps;
    await sql.begin(async (tx) => {
      const [m] = await tx`select 1 from club_members where user_id = ${c.var.user.id} and club_id = ${id}`;
      if (!m) throw notFound("Club membership");
      await leaveClub(tx, c.var.user.id);
    });
    return c.json({ ok: true });
  })
  .patch("/:id", async (c) => {
    const id = await requireOwner(c);
    const body = await jsonBody(c, patchSchema);
    assertClean(body.name, body.description);
    const cols: Record<string, unknown> = {};
    if (body.name !== undefined) cols.name = body.name;
    if (body.color !== undefined) cols.color = body.color.toUpperCase();
    if (body.description !== undefined) cols.description = body.description;
    if (body.isPublic !== undefined) cols.is_public = body.isPublic;
    const { sql } = c.var.deps;
    if (Object.keys(cols).length) await sql`update clubs set ${sql(cols)} where id = ${id}`;
    return c.json(await clubOr404(sql, id, c.var.user.id));
  })
  .delete("/:id/members/:userId", async (c) => {
    const id = await requireOwner(c);
    const target = idParam(c, "userId");
    if (target === c.var.user.id) throw new ApiError(400, "invalid_request", "Use leave to remove yourself");
    const { sql } = c.var.deps;
    await sql.begin(async (tx) => {
      const [m] = await tx`select 1 from club_members where user_id = ${target} and club_id = ${id}`;
      if (!m) throw notFound("Club member");
      await leaveClub(tx, target);
    });
    return c.json({ ok: true });
  })
  .delete("/:id", async (c) => {
    const id = await requireOwner(c);
    await c.var.deps.sql`delete from clubs where id = ${id}`;
    return c.json({ ok: true });
  });
