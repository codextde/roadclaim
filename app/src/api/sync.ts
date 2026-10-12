import { UploadState } from '@/data/db';
import { markBackedUp, pendingBackups, pendingDeletes, pendingUploads, setPendingDeletes, updateSummary } from '@/data/drives';
import { readDriveFile } from '@/data/files';
import { settings } from '@/data/settings';

import { ApiError, getToken, isNetworkError } from './client';
import { api } from './endpoints';
import { currentMe, flushPendingPrivacy } from './session';
import type { Trophy } from './types';
import { shrinkForBackup, toUpload } from './upload';

const trophyListeners = new Set<(trophies: Trophy[]) => void>();

export function onNewTrophies(cb: (trophies: Trophy[]) => void) {
  trophyListeners.add(cb);
  return () => {
    trophyListeners.delete(cb);
  };
}

const transient = (e: unknown) => isNetworkError(e) || !(e instanceof ApiError) || e.status >= 500 || e.status === 429 || e.status === 401 || e.status === 408;

const gone = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.code === 'backup_disabled');

async function run() {
  await flushPendingPrivacy();
  if (settings().localOnly || !getToken()) return;

  const deletes = pendingDeletes();
  const left: string[] = [];
  for (const [i, id] of deletes.entries()) {
    try {
      await api.deleteDrive(id).catch((e) => {
        if (!gone(e)) throw e;
      });
      await api.deleteBackup(id).catch((e) => {
        if (!gone(e) && !(e instanceof ApiError && e.status === 403)) throw e;
      });
    } catch (e) {
      if (transient(e)) {
        left.push(...deletes.slice(i));
        break;
      }
    }
  }
  setPendingDeletes(left);

  for (const drive of pendingUploads()) {
    try {
      const res = await api.uploadDrive(toUpload(drive));
      updateSummary(drive.id, { uploaded: true, territory: res.territory }, { upload_state: UploadState.uploaded });
      if (res.newTrophies.length) trophyListeners.forEach((cb) => cb(res.newTrophies));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'local_only') return;
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && !transient(e)) {
        updateSummary(drive.id, {}, { upload_state: UploadState.rejected });
        continue;
      }
      return;
    }
  }

  if (!currentMe()?.privacy.cloudBackup) return;
  for (const id of pendingBackups()) {
    const drive = await readDriveFile(id);
    if (!drive) {
      markBackedUp(id);
      continue;
    }
    try {
      await api.backupDrive(id, shrinkForBackup(drive));
      markBackedUp(id);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && !transient(e) && e.code !== 'backup_disabled') markBackedUp(id);
      else return;
    }
  }
}

let running: Promise<void> | null = null;

export function syncPending(): Promise<void> {
  if (!running) {
    running = run()
      .catch(() => undefined)
      .finally(() => {
        running = null;
      });
  }
  return running;
}
