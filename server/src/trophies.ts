import type { Sql } from "./db";

type Text = { en: string; de: string };

export type TrophyDefinition = {
  id: string;
  unit: "drives" | "km" | "days" | "cells" | "steals" | "m" | "countries" | "clubs";
  tiers: number[];
  title: Text;
  description: Text;
};

export type Trophy = {
  id: string;
  tier: 0 | 1 | 2 | 3;
  value: number;
  next: number | null;
  earnedAt: string | null;
};

export const TROPHIES: TrophyDefinition[] = [
  {
    id: "first_drive",
    unit: "drives",
    tiers: [1],
    title: { en: "First drive", de: "Erste Fahrt" },
    description: { en: "Upload your first drive.", de: "Lade deine erste Fahrt hoch." },
  },
  {
    id: "distance_total",
    unit: "km",
    tiers: [100, 1000, 10000],
    title: { en: "Mileage", de: "Kilometerstand" },
    description: { en: "Total distance driven.", de: "Insgesamt gefahrene Strecke." },
  },
  {
    id: "distance_single",
    unit: "km",
    tiers: [100, 300, 800],
    title: { en: "Road trip", de: "Roadtrip" },
    description: { en: "Distance in a single drive.", de: "Strecke in einer einzigen Fahrt." },
  },
  {
    id: "active_days",
    unit: "days",
    tiers: [7, 30, 100],
    title: { en: "Regular", de: "Stammfahrer" },
    description: { en: "Days with at least one drive.", de: "Tage mit mindestens einer Fahrt." },
  },
  {
    id: "streak",
    unit: "days",
    tiers: [3, 7, 30],
    title: { en: "Streak", de: "Serie" },
    description: { en: "Consecutive days with a drive.", de: "Aufeinanderfolgende Tage mit einer Fahrt." },
  },
  {
    id: "cells_held",
    unit: "cells",
    tiers: [100, 1000, 10000],
    title: { en: "Landlord", de: "Grundbesitzer" },
    description: { en: "Hexagons held at the same time.", de: "Gleichzeitig gehaltene Hexagone." },
  },
  {
    id: "steals",
    unit: "steals",
    tiers: [1, 50, 500],
    title: { en: "Raider", de: "Eroberer" },
    description: { en: "Hexagons taken from other drivers.", de: "Anderen Fahrern abgenommene Hexagone." },
  },
  {
    id: "night_drive",
    unit: "drives",
    tiers: [1, 10, 50],
    title: { en: "Night owl", de: "Nachteule" },
    description: { en: "Drives started between midnight and 4 am.", de: "Fahrten mit Start zwischen 0 und 4 Uhr." },
  },
  {
    id: "early_bird",
    unit: "drives",
    tiers: [1, 10, 50],
    title: { en: "Early bird", de: "Frühaufsteher" },
    description: { en: "Drives started between 4 and 6 am.", de: "Fahrten mit Start zwischen 4 und 6 Uhr." },
  },
  {
    id: "climber",
    unit: "m",
    tiers: [500, 1500, 3000],
    title: { en: "Climber", de: "Gipfelstürmer" },
    description: { en: "Elevation gain in a single drive.", de: "Höhenmeter bergauf in einer einzigen Fahrt." },
  },
  {
    id: "countries",
    unit: "countries",
    tiers: [2, 5, 10],
    title: { en: "Border crosser", de: "Grenzgänger" },
    description: { en: "Countries you have driven in.", de: "Länder, in denen du gefahren bist." },
  },
  {
    id: "club",
    unit: "clubs",
    tiers: [1],
    title: { en: "Team player", de: "Teamplayer" },
    description: { en: "Join a club.", de: "Tritt einem Club bei." },
  },
];

function longestStreak(dates: Date[]): number {
  let best = 0;
  let run = 0;
  let prev = Number.NaN;
  for (const d of dates) {
    const day = Math.round(d.getTime() / 86_400_000);
    run = day === prev + 1 ? run + 1 : 1;
    prev = day;
    best = Math.max(best, run);
  }
  return best;
}

async function progressValues(sql: Sql, userId: string): Promise<Record<string, number>> {
  const [r] = await sql`
    select
      count(*)::int as drives,
      coalesce(sum(distance_m), 0)::float8 as total_m,
      coalesce(max(distance_m), 0)::float8 as longest_m,
      count(distinct local_date)::int as active_days,
      count(*) filter (where local_hour < 4)::int as night,
      count(*) filter (where local_hour >= 4 and local_hour < 6)::int as early,
      coalesce(max(elevation_gain_m), 0)::float8 as climb,
      count(distinct country_code)::int as countries,
      (select count(*) from cells where owner_id = ${userId})::int as held,
      (select count(*) from cell_events where to_user = ${userId} and kind = 'steal')::int as steals,
      (select count(*) from club_members where user_id = ${userId})::int as club
    from drives where user_id = ${userId}`;
  const days = await sql`select distinct local_date from drives where user_id = ${userId} order by local_date`;
  const km = (m: number) => Math.round(m / 100) / 10;
  return {
    first_drive: r.drives,
    distance_total: km(r.total_m),
    distance_single: km(r.longest_m),
    active_days: r.active_days,
    streak: longestStreak(days.map((d: { local_date: Date }) => d.local_date)),
    cells_held: r.held,
    steals: r.steals,
    night_drive: r.night,
    early_bird: r.early,
    climber: Math.round(r.climb),
    countries: r.countries,
    club: r.club,
  };
}

function tierFor(def: TrophyDefinition, value: number): number {
  return def.tiers.filter((t) => value >= t).length;
}

function toTrophy(def: TrophyDefinition, value: number, tier: number, earnedAt: Date | null): Trophy {
  return {
    id: def.id,
    tier: tier as Trophy["tier"],
    value,
    next: def.tiers[tier] ?? null,
    earnedAt: earnedAt ? earnedAt.toISOString() : null,
  };
}

async function storedTiers(sql: Sql, userId: string): Promise<Map<string, { tier: number; earned_at: Date }>> {
  const rows = await sql`select trophy_id, tier, earned_at from user_trophies where user_id = ${userId}`;
  return new Map(rows.map((r: { trophy_id: string; tier: number; earned_at: Date }) => [r.trophy_id, r]));
}

export async function listTrophies(sql: Sql, userId: string): Promise<Trophy[]> {
  const [values, stored] = await Promise.all([progressValues(sql, userId), storedTiers(sql, userId)]);
  return TROPHIES.map((def) => {
    const s = stored.get(def.id);
    return toTrophy(def, values[def.id] ?? 0, s?.tier ?? 0, s?.earned_at ?? null);
  });
}

export async function evaluateTrophies(sql: Sql, userId: string, now = new Date()): Promise<Trophy[]> {
  const [values, stored] = await Promise.all([progressValues(sql, userId), storedTiers(sql, userId)]);
  const earned: Trophy[] = [];
  const awards: { trophy: string; tier: number }[] = [];
  for (const def of TROPHIES) {
    const value = values[def.id] ?? 0;
    const before = stored.get(def.id)?.tier ?? 0;
    const tier = tierFor(def, value);
    if (tier <= before) continue;
    for (let t = before + 1; t <= tier; t++) awards.push({ trophy: def.id, tier: t });
    earned.push(toTrophy(def, value, tier, now));
  }
  if (!awards.length) return earned;
  const ids = sql.array(awards.map((a) => a.trophy), "TEXT");
  const tiers = sql.array(awards.map((a) => a.tier), "INT4");
  await sql`
    insert into trophy_awards (user_id, trophy_id, tier, earned_at)
    select ${userId}, t.id, t.tier, ${now} from unnest(${ids}::text[], ${tiers}::int[]) as t(id, tier)
    on conflict do nothing`;
  await sql`
    insert into user_trophies (user_id, trophy_id, tier, earned_at)
    select ${userId}, t.id, max(t.tier), ${now} from unnest(${ids}::text[], ${tiers}::int[]) as t(id, tier) group by t.id
    on conflict (user_id, trophy_id) do update set tier = excluded.tier, earned_at = excluded.earned_at
    where user_trophies.tier < excluded.tier`;
  return earned;
}
