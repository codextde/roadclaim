import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../auth";
import { loadClubs } from "../clubs";
import type { Sql } from "../db";
import { notFound, parse, uuid, type Env } from "../http";
import { periodSchema, periodStart } from "../stats";
import { publicUsers, type PublicUser } from "../users";

export type BoardEntry = { rank: number; user: PublicUser; value: number };
type Ranked = { user_id: string; value: number; rank: number };

const boardQuery = z.object({
  metric: z.enum(["distance", "area", "longest", "trophies"]).default("distance"),
  scope: z.enum(["friends", "city", "country", "world", "club"]).default("world"),
  period: periodSchema.default("season"),
  clubId: uuid.optional(),
});

export async function rankBoard(sql: Sql, me: string, cand: any, vals: any): Promise<{ entries: BoardEntry[]; me: BoardEntry | null }> {
  const ranked = sql`
    with cand as (${cand}), vals as (${vals}),
    ranked as (
      select v.user_id, v.value::float8 as value,
        rank() over (order by v.value desc)::int as rank,
        row_number() over (order by v.value desc, v.user_id) as rn
      from vals v join cand on cand.id = v.user_id
      where v.value > 0 and v.user_id not in (select blocked_id from blocks where blocker_id = ${me})
    )`;
  const rows: (Ranked & { rn: string })[] = await sql`
    ${ranked} select user_id, value, rank, rn from ranked where rn <= 100 or user_id = ${me} order by rn`;
  const [meta] = await sql`
    ${ranked} select (select count(*) from ranked)::int as total, exists(select 1 from cand where id = ${me}) as eligible`;
  const users = await publicUsers(sql, [...rows.map((r) => r.user_id), me]);
  const toEntry = (r: Ranked) => ({ rank: r.rank, user: users.get(r.user_id)!, value: r.value });
  const entries = rows.filter((r) => Number(r.rn) <= 100).map(toEntry);
  const mine = rows.find((r) => r.user_id === me);
  const meEntry = mine ? toEntry(mine) : meta.eligible ? toEntry({ user_id: me, value: 0, rank: meta.total + 1 }) : null;
  return { entries, me: meEntry };
}

export const leaderboardRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .get("/", async (c) => {
    const q = parse(boardQuery, c.req.query());
    const { sql } = c.var.deps;
    const me = c.var.user.id;
    const start = periodStart(q.period);
    const [self] = await sql`
      select coalesce(home_city, last_city) as city, coalesce(home_country, last_country) as country,
        (select club_id from club_members where user_id = ${me}) as club_id
      from users where id = ${me}`;
    const visible = sql`u.local_only = false and (u.hide_from_leaderboards = false or u.id = ${me})`;
    let scopeLabel = "";
    let cand;
    switch (q.scope) {
      case "friends":
        scopeLabel = "Friends";
        cand = sql`select u.id from users u where u.local_only = false
          and (u.id = ${me} or u.id in (select friend_id from friendships where user_id = ${me}))`;
        break;
      case "world":
        scopeLabel = "Worldwide";
        cand = sql`select u.id from users u where ${visible}`;
        break;
      case "city":
        scopeLabel = self.city ?? "";
        cand = sql`select u.id from users u where ${visible}
          and lower(coalesce(u.home_city, u.last_city)) = lower(${self.city ?? ""})`;
        break;
      case "country":
        scopeLabel = self.country ?? "";
        cand = sql`select u.id from users u where ${visible}
          and upper(coalesce(u.home_country, u.last_country)) = upper(${self.country ?? ""})`;
        break;
      case "club": {
        const clubId = q.clubId?.toLowerCase() ?? self.club_id ?? null;
        const club = clubId ? (await loadClubs(sql, [clubId], me)).get(clubId) : null;
        if (q.clubId && !club) throw notFound("Club");
        scopeLabel = club?.name ?? "";
        cand = sql`select u.id from users u join club_members m on m.user_id = u.id
          where ${visible} and m.club_id = ${clubId}`;
        break;
      }
    }
    let vals;
    switch (q.metric) {
      case "distance":
        vals = sql`select user_id, sum(distance_m) as value from drives where started_at >= ${start} group by user_id`;
        break;
      case "longest":
        vals = sql`select user_id, max(distance_m) as value from drives where started_at >= ${start} group by user_id`;
        break;
      case "area":
        vals = sql`select owner_id as user_id, count(*) as value from cells where claimed_at >= ${start} group by owner_id`;
        break;
      case "trophies":
        vals = sql`select user_id, count(*) as value from trophy_awards where earned_at >= ${start} group by user_id`;
        break;
    }
    return c.json({ ...(await rankBoard(sql, me, cand, vals)), scopeLabel });
  })
  .get("/clubs", async (c) => {
    const q = parse(z.object({ metric: z.enum(["area", "distance"]).default("area"), period: periodSchema.default("season") }), c.req.query());
    const { sql } = c.var.deps;
    const start = periodStart(q.period);
    const rows: { club_id: string; value: number; rank: number }[] =
      q.metric === "area"
        ? await sql`
          select m.club_id, count(*)::float8 as value, rank() over (order by count(*) desc)::int as rank
          from cells x join club_members m on m.user_id = x.owner_id
          where x.claimed_at >= ${start} group by m.club_id order by value desc, m.club_id limit 100`
        : await sql`
          select m.club_id, sum(d.distance_m)::float8 as value, rank() over (order by sum(d.distance_m) desc)::int as rank
          from drives d join club_members m on m.user_id = d.user_id join users u on u.id = d.user_id
          where u.local_only = false and d.started_at >= ${start}
          group by m.club_id having sum(d.distance_m) > 0 order by value desc, m.club_id limit 100`;
    const clubs = await loadClubs(sql, rows.map((r) => r.club_id), c.var.user.id);
    return c.json({ entries: rows.map((r) => ({ rank: r.rank, club: clubs.get(r.club_id), value: r.value })) });
  });
