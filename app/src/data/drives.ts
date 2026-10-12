import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { syncPending } from '@/api/sync';
import { lifetimeStats, monthlyRecap } from '@/core/stats';
import type { Drive, DriveSummary, LifetimeStats } from '@/core/types';

import { db, getMeta, setMeta, UploadState } from './db';
import { generateDemoDrives } from './demo';
import { deleteDriveFile, readDriveFile, writeDriveFile } from './files';

type Row = { summary: string; upload_state: number; sample: number };

let cache: DriveSummary[] | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function drivesChanged() {
  cache = null;
  listeners.forEach((l) => l());
}

function parse(row: Row): DriveSummary {
  const summary = JSON.parse(row.summary) as DriveSummary;
  return { ...summary, uploaded: row.upload_state === UploadState.uploaded || summary.uploaded, sample: row.sample === 1 || undefined };
}

export function allDrives(): DriveSummary[] {
  if (!cache) {
    cache = db().getAllSync<Row>('SELECT summary, upload_state, sample FROM drives ORDER BY started_at DESC').map(parse);
  }
  return cache;
}

export function getSummary(id: string): DriveSummary | null {
  return allDrives().find((d) => d.id === id) ?? null;
}

export function toSummary(drive: Drive): DriveSummary {
  const { fixes: _fixes, events: _events, ...summary } = drive;
  return summary;
}

export function saveDrive(drive: Drive, uploadState: number = UploadState.pending) {
  writeDriveFile(drive);
  db().runSync(
    'INSERT OR REPLACE INTO drives (id, started_at, ended_at, distance_m, upload_state, backed_up, sample, summary) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
    [drive.id, Date.parse(drive.startedAt), Date.parse(drive.endedAt), drive.distanceM, uploadState, drive.sample ? 1 : 0, JSON.stringify(toSummary(drive))],
  );
  memo.delete(drive.id);
  drivesChanged();
}

export function updateSummary(id: string, patch: Partial<DriveSummary>, columns: { upload_state?: number; backed_up?: number } = {}) {
  const current = getSummary(id);
  if (!current) return;
  const next = { ...current, ...patch };
  const sets = ['summary = ?'];
  const params: (string | number)[] = [JSON.stringify(next)];
  if (columns.upload_state != null) {
    sets.push('upload_state = ?');
    params.push(columns.upload_state);
  }
  if (columns.backed_up != null) {
    sets.push('backed_up = ?');
    params.push(columns.backed_up);
  }
  db().runSync(`UPDATE drives SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  memo.delete(id);
  drivesChanged();
}

export function pendingUploads(): DriveSummary[] {
  return db()
    .getAllSync<Row>('SELECT summary, upload_state, sample FROM drives WHERE upload_state = ? AND sample = 0 ORDER BY started_at ASC', [UploadState.pending])
    .map(parse);
}

export function pendingBackups(): string[] {
  return db()
    .getAllSync<{ id: string }>('SELECT id FROM drives WHERE backed_up = 0 AND sample = 0 AND upload_state != ? ORDER BY started_at ASC', [UploadState.never])
    .map((r) => r.id);
}

export function markBackedUp(id: string) {
  db().runSync('UPDATE drives SET backed_up = 1 WHERE id = ?', [id]);
}

export function resetBackups() {
  db().runSync('UPDATE drives SET backed_up = 0 WHERE sample = 0 AND upload_state != ?', [UploadState.never]);
}

const PENDING_DELETES = 'pendingDeletes';

export function pendingDeletes(): string[] {
  return getMeta<string[]>(PENDING_DELETES) ?? [];
}

export function setPendingDeletes(ids: string[]) {
  setMeta(PENDING_DELETES, ids.length ? ids : null);
}

const memo = new Map<string, Drive>();

export async function loadDrive(id: string): Promise<Drive | null> {
  const summary = getSummary(id);
  if (!summary) return null;
  const hit = memo.get(id);
  if (hit) return hit;
  const file = await readDriveFile(id);
  const drive: Drive = { ...summary, fixes: file?.fixes ?? [], events: file?.events ?? [] };
  memo.set(id, drive);
  if (memo.size > 6) memo.delete(memo.keys().next().value as string);
  return drive;
}

export function forgetDrive(id: string) {
  db().runSync('DELETE FROM drives WHERE id = ?', [id]);
  deleteDriveFile(id);
  memo.delete(id);
  drivesChanged();
}

export async function deleteDrive(id: string): Promise<void> {
  const row = db().getFirstSync<{ sample: number; upload_state: number }>('SELECT sample, upload_state FROM drives WHERE id = ?', [id]);
  forgetDrive(id);
  if (row && row.sample === 0 && row.upload_state !== UploadState.never) {
    setPendingDeletes([...new Set([...pendingDeletes(), id])]);
    syncPending().catch(() => undefined);
  }
}

export function useDrives(): DriveSummary[] {
  return useSyncExternalStore(subscribe, allDrives);
}

export function useDrive(id: string | null | undefined): Drive | null {
  const drives = useSyncExternalStore(subscribe, allDrives);
  const [drive, setDrive] = useState<Drive | null>(() => (id ? (memo.get(id) ?? null) : null));
  useEffect(() => {
    let alive = true;
    if (!id) return;
    loadDrive(id).then((d) => {
      if (alive) setDrive(d);
    });
    return () => {
      alive = false;
    };
  }, [id, drives]);
  return drive && drive.id === id ? drive : null;
}

export function useLifetimeStats(range?: { from?: Date; to?: Date }): LifetimeStats {
  const drives = useSyncExternalStore(subscribe, allDrives);
  const from = range?.from?.getTime();
  const to = range?.to?.getTime();
  return useMemo(
    () => lifetimeStats(drives, { from: from == null ? undefined : new Date(from), to: to == null ? undefined : new Date(to) }),
    [drives, from, to],
  );
}

export function useMonthlyRecap(month: string) {
  const drives = useSyncExternalStore(subscribe, allDrives);
  return useMemo(() => monthlyRecap(drives, month), [drives, month]);
}

function insertGenerated(drives: Drive[]) {
  const d = db();
  d.withTransactionSync(() => {
    for (const drive of drives) {
      writeDriveFile(drive);
      d.runSync(
        'INSERT OR REPLACE INTO drives (id, started_at, ended_at, distance_m, upload_state, backed_up, sample, summary) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
        [drive.id, Date.parse(drive.startedAt), Date.parse(drive.endedAt), drive.distanceM, UploadState.never, drive.sample ? 1 : 0, JSON.stringify(toSummary(drive))],
      );
    }
  });
  drivesChanged();
}

export async function seedDemoData(): Promise<void> {
  insertGenerated(generateDemoDrives(new Date(), false));
}

export async function loadSampleDrives(): Promise<void> {
  if (hasSampleDrives()) return;
  insertGenerated(generateDemoDrives(new Date(), true));
}

export async function removeSampleDrives(): Promise<void> {
  const ids = db()
    .getAllSync<{ id: string }>('SELECT id FROM drives WHERE sample = 1')
    .map((r) => r.id);
  db().runSync('DELETE FROM drives WHERE sample = 1');
  ids.forEach((id) => {
    deleteDriveFile(id);
    memo.delete(id);
  });
  drivesChanged();
}

function hasSampleDrives() {
  return allDrives().some((d) => d.sample);
}

export function useHasSampleDrives(): boolean {
  return useSyncExternalStore(subscribe, allDrives).some((d) => d.sample);
}
