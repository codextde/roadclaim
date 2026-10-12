import { Hono } from "hono";
import { gridDistance } from "h3-js";
import { z } from "zod";
import { requireAuth } from "../auth";
import { ApiError, enforceLimit, forbidden, idParam, jsonBody, uuid, type Env } from "../http";
import { claimCells, isRes9Cell, type TerritoryResult } from "../territory";
import { evaluateTrophies } from "../trophies";

const num = (max: number) => z.number().finite().min(0).max(max);
const count = z.number().int().min(0).max(1_000_000);

const MAX_CELL_GAP = 20;
const isoOffset = /(?:Z|([+-])(\d{2}):?(\d{2}))$/i;

const driveSchema = z
  .object({
    id: uuid,
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }),
    utcOffsetMin: z.number().int().min(-840).max(840).optional(),
    distanceM: num(5_000_000),
    durationS: num(7 * 86400),
    movingS: num(7 * 86400),
    maxSpeedMps: num(90),
    avgSpeedMps: num(70),
    elevationGainM: num(100_000),
    elevationLossM: num(100_000),
    brakePresses: count,
    turnsLeft: count,
    turnsRight: count,
    laneChanges: count,
    stops: count,
    city: z.string().trim().max(100).nullable().optional(),
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional(),
    cells: z.array(z.string().max(20)).max(20_000),
  })
  .superRefine((d, ctx) => {
    if (Date.parse(d.endedAt) < Date.parse(d.startedAt)) ctx.addIssue({ code: "custom", message: "endedAt is before startedAt", path: ["endedAt"] });
    if (Date.parse(d.startedAt) > Date.now() + 10 * 60_000) ctx.addIssue({ code: "custom", message: "startedAt is in the future", path: ["startedAt"] });
    if (d.cells.length > d.distanceM / 100 + 20) ctx.addIssue({ code: "custom", message: "too many cells for this distance", path: ["cells"] });
    if (d.movingS > d.durationS) ctx.addIssue({ code: "custom", message: "movingS exceeds durationS", path: ["movingS"] });
    if (d.distanceM > d.maxSpeedMps * d.movingS * 1.1 + 500) {
      ctx.addIssue({ code: "custom", message: "distanceM is not plausible for maxSpeedMps and movingS", path: ["distanceM"] });
    }
    const bad = d.cells.find((c) => !isRes9Cell(c));
    if (bad !== undefined) {
      ctx.addIssue({ code: "custom", message: `invalid H3 resolution 9 cell ${bad}`, path: ["cells"] });
      return;
    }
    let hops = 0;
    for (let i = 1; i < d.cells.length; i++) {
      let step: number;
      try {
        step = gridDistance(d.cells[i - 1]!, d.cells[i]!);
      } catch {
        step = Number.POSITIVE_INFINITY;
      }
      if (!(step <= MAX_CELL_GAP)) {
        ctx.addIssue({ code: "custom", message: `cells ${i - 1} and ${i} are too far apart`, path: ["cells"] });
        return;
      }
      hops += step;
    }
    if (hops * 175 > d.distanceM * 1.5 + 1000) ctx.addIssue({ code: "custom", message: "cells cover more ground than distanceM", path: ["cells"] });
  });

function localTime(startedAt: string, offsetMin: number | undefined): { date: string; hour: number } {
  let offset = offsetMin;
  if (offset === undefined) {
    const m = isoOffset.exec(startedAt);
    offset = m?.[1] ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  }
  const local = new Date(Date.parse(startedAt) + offset * 60_000);
  return { date: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

export const driveRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .post("/", async (c) => {
    const user = c.var.user;
    if (user.local_only) throw forbidden("local_only", "Uploads are off because the account is set to local only");
    enforceLimit(c, "upload", user.id);
    const d = await jsonBody(c, driveSchema);
    const id = d.id.toLowerCase();
    const { sql } = c.var.deps;
    const local = localTime(d.startedAt, d.utcOffsetMin);
    const startedAt = new Date(d.startedAt);
    const result = await sql.begin(async (tx) => {
      const [existing] = await tx`select user_id, territory from drives where id = ${id}`;
      if (existing) {
        if (existing.user_id !== user.id) throw new ApiError(409, "drive_exists", "A drive with this id already exists");
        return { territory: existing.territory as TerritoryResult, newTrophies: [], duplicate: true };
      }
      const inserted = await tx`
        insert into drives (id, user_id, started_at, ended_at, local_date, local_hour, distance_m, duration_s, moving_s,
          max_speed_mps, avg_speed_mps, elevation_gain_m, elevation_loss_m, brake_presses, turns_left, turns_right,
          lane_changes, stops, city, country_code, cell_count, territory)
        values (${id}, ${user.id}, ${startedAt}, ${new Date(d.endedAt)}, ${local.date}, ${local.hour}, ${d.distanceM},
          ${d.durationS}, ${d.movingS}, ${d.maxSpeedMps}, ${d.avgSpeedMps}, ${d.elevationGainM}, ${d.elevationLossM},
          ${d.brakePresses}, ${d.turnsLeft}, ${d.turnsRight}, ${d.laneChanges}, ${d.stops}, ${d.city || null},
          ${d.countryCode ?? null}, ${d.cells.length}, ${{}})
        on conflict (id) do nothing
        returning id`;
      if (!inserted.length) throw new ApiError(409, "drive_exists", "This drive is being uploaded already");
      const territory = await claimCells(tx, user.id, d.cells, new Date());
      await tx`update drives set territory = ${territory} where id = ${id}`;
      await tx`
        update users set
          last_city = coalesce(${d.city || null}, last_city),
          last_country = coalesce(${d.countryCode ?? null}, last_country),
          last_drive_at = ${startedAt}
        where id = ${user.id} and (last_drive_at is null or last_drive_at <= ${startedAt})`;
      return { territory, newTrophies: await evaluateTrophies(tx, user.id), duplicate: false };
    });
    return c.json({ territory: result.territory, newTrophies: result.newTrophies }, result.duplicate ? 200 : 201);
  })
  .delete("/:id", async (c) => {
    const rows = await c.var.deps.sql`delete from drives where id = ${idParam(c)} and user_id = ${c.var.user.id} returning id`;
    if (!rows.length) throw new ApiError(404, "not_found", "Drive not found");
    return c.json({ ok: true });
  });
