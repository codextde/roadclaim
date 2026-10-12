import { Hono } from "hono";
import { requireAuth } from "../auth";
import { ApiError, badRequest, forbidden, notFound, type Ctx, type Env } from "../http";

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

function driveId(c: Ctx): string {
  const id = c.req.param("id") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw notFound("Backup");
  return id;
}

export const backupRoutes = new Hono<Env>()
  .use("*", requireAuth)
  .put("/drives/:id", async (c) => {
    if (!c.var.user.cloud_backup) throw forbidden("backup_disabled", "Cloud backup is turned off in privacy settings");
    const id = driveId(c);
    const raw = await c.req.text();
    const size = Buffer.byteLength(raw);
    if (size > MAX_BACKUP_BYTES) throw new ApiError(413, "too_large", "Backups are limited to 5 MB per drive");
    try {
      JSON.parse(raw);
    } catch {
      throw badRequest("Body must be valid JSON");
    }
    await c.var.deps.sql`
      insert into backups (user_id, drive_id, data, size) values (${c.var.user.id}, ${id}, ${raw}, ${size})
      on conflict (user_id, drive_id) do update set data = excluded.data, size = excluded.size, updated_at = now()`;
    return c.json({ ok: true });
  })
  .get("/drives", async (c) => {
    const rows = await c.var.deps.sql`
      select drive_id, updated_at, size from backups where user_id = ${c.var.user.id} order by updated_at desc`;
    return c.json({ items: rows.map((r: any) => ({ id: r.drive_id, updatedAt: r.updated_at.toISOString(), size: r.size })) });
  })
  .get("/drives/:id", async (c) => {
    const [row] = await c.var.deps.sql`select data from backups where user_id = ${c.var.user.id} and drive_id = ${driveId(c)}`;
    if (!row) throw notFound("Backup");
    return c.body(row.data, 200, { "content-type": "application/json" });
  })
  .delete("/drives/:id", async (c) => {
    await c.var.deps.sql`delete from backups where user_id = ${c.var.user.id} and drive_id = ${driveId(c)}`;
    return c.json({ ok: true });
  });
