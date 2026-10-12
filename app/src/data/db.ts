import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS drives (
    id TEXT PRIMARY KEY NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    distance_m REAL NOT NULL,
    upload_state INTEGER NOT NULL DEFAULT 0,
    backed_up INTEGER NOT NULL DEFAULT 0,
    sample INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS drives_started ON drives (started_at DESC);
  CREATE INDEX IF NOT EXISTS drives_upload ON drives (upload_state);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);`,
  `UPDATE drives SET upload_state = 0 WHERE upload_state = 2;`,
];

export const UploadState = { pending: 0, uploaded: 1, rejected: 2, never: 3 } as const;

let database: SQLiteDatabase | null = null;

export function db(): SQLiteDatabase {
  if (database) return database;
  const d = openDatabaseSync('roadclaim.db');
  d.execSync('PRAGMA journal_mode = WAL;');
  const row = d.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  for (let v = from; v < MIGRATIONS.length; v++) {
    d.withTransactionSync(() => {
      d.execSync(MIGRATIONS[v]);
      d.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  database = d;
  return d;
}

export function getMeta<T>(key: string): T | null {
  const row = db().getFirstSync<{ value: string | null }>('SELECT value FROM meta WHERE key = ?', [key]);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setMeta(key: string, value: unknown) {
  if (value == null) db().runSync('DELETE FROM meta WHERE key = ?', [key]);
  else db().runSync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
}
