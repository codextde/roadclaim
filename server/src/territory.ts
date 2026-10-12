import { cellToLatLng, cellToParent, getResolution, gridDisk, isValidCell, latLngToCell, polygonToCells } from "h3-js";
import type { Sql } from "./db";

export const H3_RESOLUTION = 9;
export const PARENT_RES = 5;

export function parentsForBbox(minLat: number, minLng: number, maxLat: number, maxLng: number): string[] {
  const ring: [number, number][] = [
    [minLat, minLng],
    [minLat, maxLng],
    [maxLat, maxLng],
    [maxLat, minLng],
  ];
  const seeds = new Set(polygonToCells(ring, PARENT_RES));
  for (const [lat, lng] of [...ring, [(minLat + maxLat) / 2, (minLng + maxLng) / 2] as [number, number]]) {
    seeds.add(latLngToCell(lat, lng, PARENT_RES));
  }
  const out = new Set<string>();
  for (const s of seeds) for (const n of gridDisk(s, 1)) out.add(n);
  return [...out];
}

export async function backfillParents(sql: Sql): Promise<number> {
  let total = 0;
  for (;;) {
    const rows: { cell: string }[] = await sql`select cell from cells where parent5 is null limit 5000`;
    if (!rows.length) return total;
    const cells = rows.map((r) => r.cell);
    await sql`
      update cells c set parent5 = t.parent5
      from unnest(${sql.array(cells, "TEXT")}::text[], ${sql.array(cells.map((c) => cellToParent(c, PARENT_RES)), "TEXT")}::text[])
        as t(cell, parent5)
      where c.cell = t.cell`;
    total += rows.length;
  }
}

export type TerritoryResult = { claimed: number; stolen: number; refreshed: number; held: number };

export function isRes9Cell(cell: string): boolean {
  return isValidCell(cell) && getResolution(cell) === H3_RESOLUTION;
}

export async function claimCells(tx: Sql, userId: string, cells: string[], at: Date): Promise<TerritoryResult> {
  const unique = [...new Set(cells)].sort();
  const result: TerritoryResult = { claimed: 0, stolen: 0, refreshed: 0, held: 0 };
  if (unique.length) {
    const cellArr = tx.array(unique, "TEXT");
    const prev = await tx`
      select cell, owner_id from cells where cell = any(${cellArr}::text[]) order by cell for update`;
    const owners = new Map<string, string>(prev.map((r: { cell: string; owner_id: string }) => [r.cell, r.owner_id]));
    const evCells: string[] = [];
    const evFrom: string[] = [];
    const evKind: string[] = [];
    for (const cell of unique) {
      const owner = owners.get(cell);
      if (owner === userId) {
        result.refreshed++;
        continue;
      }
      evCells.push(cell);
      evFrom.push(owner ?? "");
      evKind.push(owner ? "steal" : "claim");
      if (owner) result.stolen++;
      else result.claimed++;
    }
    const centers = unique.map((c) => cellToLatLng(c));
    const [membership] = await tx`select club_id from club_members where user_id = ${userId}`;
    await tx`
      insert into cells (cell, owner_id, club_id, claimed_at, refreshed_at, lat, lng, parent5)
      select t.cell, ${userId}, ${membership?.club_id ?? null}, ${at}, ${at}, t.lat, t.lng, t.parent5
      from unnest(${cellArr}::text[], ${tx.array(centers.map((p) => p[0]), "FLOAT8")}::float8[],
                  ${tx.array(centers.map((p) => p[1]), "FLOAT8")}::float8[],
                  ${tx.array(unique.map((c) => cellToParent(c, PARENT_RES)), "TEXT")}::text[]) as t(cell, lat, lng, parent5)
      on conflict (cell) do update set
        owner_id = excluded.owner_id,
        club_id = excluded.club_id,
        refreshed_at = excluded.refreshed_at,
        claimed_at = case when cells.owner_id = excluded.owner_id then cells.claimed_at else excluded.claimed_at end`;
    if (evCells.length) {
      await tx`
        insert into cell_events (cell, from_user, to_user, at, kind)
        select t.cell, nullif(t.from_user, '')::uuid, ${userId}, ${at}, t.kind
        from unnest(${tx.array(evCells, "TEXT")}::text[], ${tx.array(evFrom, "TEXT")}::text[],
                    ${tx.array(evKind, "TEXT")}::text[]) as t(cell, from_user, kind)`;
    }
    await tx`
      insert into user_cells_ever (user_id, cell)
      select ${userId}, c from unnest(${cellArr}::text[]) as c
      on conflict do nothing`;
  }
  const [h] = await tx`select count(*)::int as n from cells where owner_id = ${userId}`;
  result.held = h.n;
  return result;
}

export function parseMonth(month: string | undefined, now = new Date()): { start: Date; end: Date; current: boolean } {
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  if (month) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new RangeError("month must be YYYY-MM");
    y = Number(match[1]);
    m = Number(match[2]) - 1;
  }
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  return { start, end, current: start.getTime() <= now.getTime() && now.getTime() < end.getTime() };
}
