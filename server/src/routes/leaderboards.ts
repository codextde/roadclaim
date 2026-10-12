import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../auth";
import { loadClubs } from "../clubs";
import type { Sql } from "../db";
import { notFound, parse, uuid, type Ctx, type Env } from "../http";
import { periodSchema, periodStart } from "../stats";
import { blockedSet, publicUsers, type PublicUser } from "../users";

export type BoardEntry = { rank: number; user: PublicUser; value: number };
type Row = { user_id: string; value: number };

const MAX_CACHE_KEYS = 1000;

const boardQuery = z.object({
  metric: z.enum(["distance", "area", "longest", "trophies"]).default("distance"),
  scope: z.enum(["friends", "city", "country", "world", "club"]).default("world"),
  period: periodSchema.default("season"),
  clubId: uuid.optional(),
});

export async function cached<T>(c: Ctx, key: string, load: () => Promise<T>): Promise<T> {
  const { boardCache, config } = c.var.deps;
  if (config.boardCacheMs <= 0) return load();
  const now = Date.now();
  const hit = boardCache.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = await load();
  if (boardCache.size >= MAX_CACHE_KEYS) {
    for (const [k, v] of boardCache) if (v.expires <= now) boardCache.delete(k);
    if (boardCache.size >= MAX_CACHE_KEYS) boardCache.clear();
  }
  boardCache.set(key, { expires: now + config.boardCacheMs, value });
  return value;
}

function rows(sql: Sql, cand: any, vals: any): Promise<Row[]> {
  return sql`
    with cand as (${cand}), vals as (${vals})
    select v.user_id, v.value::float8 as value from vals v join cand on cand.id = v.user_id
    where v.value > 0 order by v.value desc, v.user_id`;
}

async function eligible(sql: Sql, cand: any, me: string): Promise<boolean> {
  const [r] = await sql`with cand as (${cand}) select exists(select 1 from cand where id = ${me}) as ok`;
  return r.ok;
}

export async function assemble(
  sql: Sql,
  me: string,
  ranked: Row[],
  opts: { eligible: boolean; self?: Row | null },
): Promise<{ entries: BoardEntry[]; me: BoardEntry | null }> {
  const blocked = await blockedSet(sql, me);
  const list = ranked.filter((r) => !blocked.has(r.user_id) && r.user_id !== me);
  const self = opts.self !== undefined ? opts.self : (ranked.find((r) => r.user_id === me) ?? null);
  if (self && self.value > 0) {
    const at = list.findIndex((r) => r.value < self.value);
    list.splice(at === -1 ? list.length : at, 0, self);
  }
  const withRank: (Row & { rank: number })[] = [];
  list.forEach((r, i) => {
    const prev = withRank[i - 1];
    withRank.push({ ...r, rank: prev && prev.value === r.value ? prev.rank : i + 1 });
  });
  const top = withRank.slice(0, 100);
  const mine = withRank.find((r) => r.user_id === me) ?? (opts.eligible ? { user_id: me, value: 0, rank: withRank.length + 1 } : null);
  const users = await publicUsers(sql, [...top.map((r) => r.user_id), me]);
  const toEntry = (r: Row & { rank: number }) => ({ rank: r.rank, user: users.get(r.user_id)!, value: r.value });
  return { entries: top.map(toEntry), me: mine && opts.eligible ? toEntry(mine) : null };
}

export async function rankBoard(sql: Sql, me: string, cand: any, vals: any) {
  const [ranked, ok] = await Promise.all([rows(sql, cand, vals), eligible(sql, cand, me)]);
  return assemble(sql, me, ranked, { eligible: ok });
}

function metricValues(sql: Sql, metric: z.infer<typeof boardQuery>["metric"], start: Date) {
  switch (metric) {
    case "distance":
      return sql`select user_id, sum(distance_m) as value from drives where started_at >= ${start} group by user_id`;
    case "longest":
      return sql`select user_id, max(distance_m) as value from drives where started_at >= ${start} group by user_id`;
    case "area":
      return sql`select owner_id as user_id, count(*) as value from cells where claimed_at >= ${start} group by owner_id`;
    case "trophies":
      return sql`select user_id, count(*) as value from trophy_awards where earned_at >= ${start} group by user_id`;
  }
}

export const leaderboardRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .get("/", async (c) => {
    const q = parse(boardQuery, c.req.query());
    const { sql } = c.var.deps;
    const user = c.var.user;
    const me = user.id;
    const start = periodStart(q.period);
    const vals = metricValues(sql, q.metric, start);
    const [self] = await sql`
      select coalesce(home_city, last_city) as city, coalesce(home_country, last_country) as country,
        (select club_id from club_members where user_id = ${me}) as club_id
      from users where id = ${me}`;
    const visible = sql`u.local_only = false and (u.hide_from_leaderboards = false or u.id = ${me})`;
    const ownValue = async (): Promise<Row | null> => {
      if (!user.hide_from_leaderboards || user.local_only) return null;
      const [r] = await sql`with vals as (${vals}) select user_id, value::float8 as value from vals where user_id = ${me}`;
      return r ?? null;
    };

    if (q.scope === "world" || q.scope === "club") {
      let clubId: string | null = null;
      let scopeLabel = "Worldwide";
      if (q.scope === "club") {
        clubId = q.clubId?.toLowerCase() ?? self.club_id ?? null;
        const club = clubId ? (await loadClubs(sql, [clubId], me)).get(clubId) : null;
        if (q.clubId && (!club || (!club.isPublic && club.inviteCode === undefined))) throw notFound("Club");
        scopeLabel = club?.name ?? "";
      }
      const isMember = q.scope === "world" || (!!clubId && clubId === self.club_id);
      const ranked = await cached(c, `board|${q.scope}|${clubId}|${q.metric}|${q.period}|${start.toISOString()}`, () =>
        rows(
          sql,
          q.scope === "world"
            ? sql`select u.id from users u where u.local_only = false and u.hide_from_leaderboards = false`
            : sql`select u.id from users u join club_members m on m.user_id = u.id
                where u.local_only = false and u.hide_from_leaderboards = false and m.club_id = ${clubId}`,
          vals,
        ),
      );
      const board = await assemble(sql, me, ranked, {
        eligible: !user.local_only && isMember,
        self: isMember ? (user.hide_from_leaderboards ? await ownValue() : ranked.find((r) => r.user_id === me) ?? null) : null,
      });
      return c.json({ ...board, scopeLabel });
    }

    let scopeLabel = "";
    let cand;
    switch (q.scope) {
      case "friends":
        scopeLabel = "Friends";
        cand = sql`select u.id from users u where u.local_only = false
          and (u.id = ${me} or u.id in (select friend_id from friendships where user_id = ${me}))`;
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
    }
    return c.json({ ...(await rankBoard(sql, me, cand, vals)), scopeLabel });
  })
  .get("/clubs", async (c) => {
    const q = parse(z.object({ metric: z.enum(["area", "distance"]).default("area"), period: periodSchema.default("season") }), c.req.query());
    const { sql } = c.var.deps;
    const start = periodStart(q.period);
    const all: { club_id: string; value: number; is_public: boolean }[] = await cached(
      c,
      `clubs|${q.metric}|${q.period}|${start.toISOString()}`,
      () =>
        q.metric === "area"
          ? sql`
            select m.club_id, count(*)::float8 as value, bool_or(k.is_public) as is_public
            from cells x join club_members m on m.user_id = x.owner_id join clubs k on k.id = m.club_id
            join users u on u.id = x.owner_id
            where u.local_only = false and x.claimed_at >= ${start} group by m.club_id order by value desc, m.club_id`
          : sql`
            select m.club_id, sum(d.distance_m)::float8 as value, bool_or(k.is_public) as is_public
            from drives d join club_members m on m.user_id = d.user_id join clubs k on k.id = m.club_id
            join users u on u.id = d.user_id
            where u.local_only = false and d.started_at >= ${start}
            group by m.club_id having sum(d.distance_m) > 0 order by value desc, m.club_id`,
    );
    const [mine] = await sql`select club_id from club_members where user_id = ${c.var.user.id}`;
    const visible = all.filter((r) => r.is_public || r.club_id === mine?.club_id);
    const ranked: { club_id: string; value: number; rank: number }[] = [];
    visible.slice(0, 100).forEach((r, i) => {
      const prev = ranked[i - 1];
      ranked.push({ club_id: r.club_id, value: r.value, rank: prev && prev.value === r.value ? prev.rank : i + 1 });
    });
    const clubs = await loadClubs(sql, ranked.map((r) => r.club_id), c.var.user.id);
    return c.json({ entries: ranked.map((r) => ({ rank: r.rank, club: clubs.get(r.club_id), value: r.value })) });
  });
