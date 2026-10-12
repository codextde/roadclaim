import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../auth";
import { ApiError, badRequest, notFound, parse, uuid, type Env } from "../http";
import { parentsForBbox, parseMonth } from "../territory";
import { rankBoard } from "./leaderboards";

const MAX_SPAN_DEG = 0.6;
const MAX_CELLS = 5000;
const BLOCKED_COLOR = "#6B7280";

export const territoryRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .get("/cells", async (c) => {
    const parts = (c.req.query("bbox") ?? "").split(",").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) throw badRequest("bbox must be minLat,minLng,maxLat,maxLng");
    const [minLat, minLng, maxLat, maxLng] = parts as [number, number, number, number];
    if (minLat > maxLat || minLng > maxLng || Math.abs(minLat) > 90 || Math.abs(maxLat) > 90 || Math.abs(minLng) > 180 || Math.abs(maxLng) > 180) {
      throw badRequest("bbox is out of range");
    }
    if (maxLat - minLat > MAX_SPAN_DEG || maxLng - minLng > MAX_SPAN_DEG) throw new ApiError(413, "zoom_in", "Zoom in to see territory");
    const clubId = parse(uuid.optional(), c.req.query("clubId"))?.toLowerCase() ?? null;
    const { sql } = c.var.deps;
    const me = c.var.user.id;
    const [mine] = await sql`select club_id from club_members where user_id = ${me}`;
    if (clubId) {
      const [club] = await sql`select is_public from clubs where id = ${clubId}`;
      if (!club || (!club.is_public && mine?.club_id !== clubId)) throw notFound("Club");
    }
    const parents = sql.array(parentsForBbox(minLat, minLng, maxLat, maxLng), "TEXT");
    const rows = await sql`
      select x.cell, x.owner_id, x.club_id, u.display_name, u.avatar_color,
        exists(select 1 from friendships f where f.user_id = ${me} and f.friend_id = x.owner_id) as is_friend,
        exists(select 1 from blocks b where (b.blocker_id = ${me} and b.blocked_id = x.owner_id)
          or (b.blocker_id = x.owner_id and b.blocked_id = ${me})) as is_blocked
      from cells x join users u on u.id = x.owner_id
      where x.parent5 = any(${parents}::text[]) and u.local_only = false
        and x.lat between ${minLat} and ${maxLat} and x.lng between ${minLng} and ${maxLng}
        ${clubId ? sql`and x.club_id = ${clubId}` : sql``}
      limit ${MAX_CELLS}`;
    const myClub: string | null = mine?.club_id ?? null;
    return c.json({
      cells: rows.map((r: any) =>
        r.is_blocked
          ? { cell: r.cell, owner: "other", userId: r.owner_id, name: "", color: BLOCKED_COLOR }
          : {
              cell: r.cell,
              owner: r.owner_id === me ? "me" : r.is_friend ? "friend" : myClub && r.club_id === myClub ? "club" : "other",
              userId: r.owner_id,
              name: r.display_name,
              color: r.avatar_color,
            },
      ),
    });
  })
  .get("/mine", async (c) => {
    const { sql } = c.var.deps;
    const me = c.var.user.id;
    const [held, ever] = await Promise.all([
      sql`select cell from cells where owner_id = ${me} order by cell`,
      sql`select cell from user_cells_ever where user_id = ${me} order by cell`,
    ]);
    return c.json({ held: held.map((r: { cell: string }) => r.cell), ever: ever.map((r: { cell: string }) => r.cell) });
  })
  .get("/season", async (c) => {
    const q = parse(
      z.object({
        board: z.enum(["overall", "stealers", "gainers", "losers"]).default("overall"),
        month: z.string().optional(),
        scope: z.enum(["world", "friends"]).default("world"),
      }),
      c.req.query(),
    );
    let range;
    try {
      range = parseMonth(q.month);
    } catch {
      throw badRequest("month must be YYYY-MM");
    }
    const first = parseMonth(c.var.deps.config.seasonStartMonth).start;
    if (range.start < first || range.start.getTime() > parseMonth(undefined).start.getTime()) {
      throw badRequest(`month must be between ${c.var.deps.config.seasonStartMonth} and the current month`, "invalid_month");
    }
    const { start, end, current } = range;
    const { sql } = c.var.deps;
    const me = c.var.user.id;
    const cand =
      q.scope === "friends"
        ? sql`select u.id from users u where u.local_only = false
            and (u.id = ${me} or u.id in (select friend_id from friendships where user_id = ${me}))`
        : sql`select u.id from users u where u.local_only = false and (u.hide_from_leaderboards = false or u.id = ${me})`;
    let vals;
    switch (q.board) {
      case "overall":
        vals = current
          ? sql`select owner_id as user_id, count(*) as value from cells group by owner_id`
          : sql`select to_user as user_id, count(*) as value from (
              select distinct on (cell) cell, to_user from cell_events where at < ${end} order by cell, at desc, id desc
            ) h where ${start.getTime() <= Date.now()} group by to_user`;
        break;
      case "stealers":
        vals = sql`select to_user as user_id, count(*) as value from cell_events
          where kind = 'steal' and at >= ${start} and at < ${end} group by to_user`;
        break;
      case "losers":
        vals = sql`select from_user as user_id, count(*) as value from cell_events
          where kind = 'steal' and from_user is not null and at >= ${start} and at < ${end} group by from_user`;
        break;
      case "gainers":
        vals = sql`select user_id, sum(delta) as value from (
            select to_user as user_id, 1 as delta from cell_events where at >= ${start} and at < ${end}
            union all
            select from_user, -1 from cell_events where kind = 'steal' and from_user is not null and at >= ${start} and at < ${end}
          ) g group by user_id`;
        break;
    }
    return c.json(await rankBoard(sql, me, cand, vals));
  });
