import { Directory, File, Paths } from 'expo-file-system';

import type { Drive, Fix } from '@/core/types';

function dir(name: string) {
  const d = new Directory(Paths.document, name);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export const driveFile = (id: string) => new File(dir('drives'), `${id}.json`);

export function writeDriveFile(drive: Drive) {
  const file = driveFile(drive.id);
  if (!file.exists) file.create({ intermediates: true });
  file.write(JSON.stringify(drive));
}

export async function readDriveFile(id: string): Promise<Drive | null> {
  const file = driveFile(id);
  if (!file.exists) return null;
  try {
    return JSON.parse(await file.text()) as Drive;
  } catch {
    return null;
  }
}

export function deleteDriveFile(id: string) {
  const file = driveFile(id);
  if (file.exists) file.delete();
}

const trackFile = (id: string) => new File(dir('recording'), `${id}.ndjson`);

export function appendTrack(id: string, fixes: Fix[]) {
  if (!fixes.length) return;
  const file = trackFile(id);
  if (!file.exists) file.create({ intermediates: true });
  file.write(fixes.map((f) => JSON.stringify(f)).join('\n') + '\n', { append: true });
}

export function readTrack(id: string): Fix[] {
  const file = trackFile(id);
  if (!file.exists) return [];
  const out: Fix[] = [];
  for (const line of file.textSync().split('\n')) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as Fix);
    } catch {
      // a torn last line after a crash
    }
  }
  return out;
}

export function deleteTrack(id: string) {
  const file = trackFile(id);
  if (file.exists) file.delete();
}
