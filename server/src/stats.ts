import { z } from "zod";
import type { Sql } from "./db";

export const periodSchema = z.enum(["today", "week", "month", "season"]);
export type Period = z.infer<typeof periodSchema>;

export function periodStart(period: Period, now = new Date()): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (period) {
    case "today":
      return new Date(Date.UTC(y, m, d));
    case "week":
      return new Date(Date.UTC(y, m, d - ((now.getUTCDay() + 6) % 7)));
    case "month":
      return new Date(Date.UTC(y, m, 1));
    case "season":
      return new Date(Date.UTC(y, 0, 1));
  }
}

export type Stats = {
  distanceM: number;
  drives: number;
  longestM: number;
  cellsHeld: number;
  cellsEver: number;
  trophies: number;
  activeDays: number;
  elevationGainM: number;
  durationS: number;
  countries: number;
};

export async function userStats(sql: Sql, userId: string, period: Period = "season"): Promise<Stats> {
  const start = periodStart(period);
  const [r] = await sql`
    select
      coalesce(sum(distance_m), 0)::float8 as distance_m,
      count(*)::int as drives,
      coalesce(max(distance_m), 0)::float8 as longest_m,
      count(distinct local_date)::int as active_days,
      coalesce(sum(elevation_gain_m), 0)::float8 as elevation_gain_m,
      coalesce(sum(duration_s), 0)::float8 as duration_s,
      count(distinct country_code)::int as countries,
      (select count(*) from cells where owner_id = ${userId})::int as cells_held,
      (select count(*) from user_cells_ever where user_id = ${userId})::int as cells_ever,
      (select count(*) from trophy_awards where user_id = ${userId} and earned_at >= ${start})::int as trophies
    from drives where user_id = ${userId} and started_at >= ${start}`;
  return {
    distanceM: r.distance_m,
    drives: r.drives,
    longestM: r.longest_m,
    cellsHeld: r.cells_held,
    cellsEver: r.cells_ever,
    trophies: r.trophies,
    activeDays: r.active_days,
    elevationGainM: r.elevation_gain_m,
    durationS: r.duration_s,
    countries: r.countries,
  };
}
