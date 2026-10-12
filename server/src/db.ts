import { SQL } from "bun";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { log } from "./log";

export type Sql = SQL;

export function connect(url: string): SQL {
  return new SQL(url, { max: 20, idleTimeout: 30 });
}

export const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

export async function migrate(sql: SQL, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727274)`;
    await tx`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await tx`select name from schema_migrations`).map((r: { name: string }) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      await tx.unsafe(await Bun.file(join(dir, file)).text());
      await tx`insert into schema_migrations (name) values (${file})`;
      applied.push(file);
    }
  });
  if (applied.length) log("info", "migrations applied", { applied });
  return applied;
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { errno?: string; constraint?: string };
  return e?.errno === "23505" && (!constraint || e.constraint === constraint);
}
