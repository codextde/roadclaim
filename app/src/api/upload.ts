import { fitCells } from '@/core/metrics';
import type { Drive, DriveSummary } from '@/core/types';

import type { DriveUpload } from './types';

export function toUpload(d: DriveSummary): DriveUpload {
  const durationS = Math.max(0, Math.round(d.durationS));
  const movingS = Math.min(durationS, Math.max(0, Math.round(d.movingS)));
  let maxSpeedMps = Math.min(90, Math.max(0, d.maxSpeedMps));
  let distanceM = Math.max(0, Math.round(d.distanceM));
  if (distanceM > maxSpeedMps * movingS * 1.1 + 500) {
    maxSpeedMps = Math.min(90, Math.max(maxSpeedMps, (distanceM - 500) / (1.1 * Math.max(1, movingS))));
    distanceM = Math.min(distanceM, Math.floor(maxSpeedMps * movingS * 1.1 + 500));
  }
  return {
    id: d.id,
    startedAt: d.startedAt,
    endedAt: d.endedAt,
    distanceM,
    durationS,
    movingS,
    maxSpeedMps: Math.min(90, Math.ceil(maxSpeedMps * 100) / 100),
    avgSpeedMps: Math.min(movingS > 0 ? distanceM / movingS : 0, 70),
    elevationGainM: d.elevationGainM,
    elevationLossM: d.elevationLossM,
    brakePresses: d.brakePresses,
    turnsLeft: d.turnsLeft,
    turnsRight: d.turnsRight,
    laneChanges: d.laneChanges,
    stops: d.stops,
    city: d.city,
    countryCode: d.countryCode,
    cells: fitCells(d.cells, distanceM),
    utcOffsetMin: -new Date(d.startedAt).getTimezoneOffset(),
  };
}

const MAX_BACKUP_BYTES = 4_800_000;

export function shrinkForBackup(drive: Drive): Drive {
  let out = drive;
  let step = 2;
  while (JSON.stringify(out).length > MAX_BACKUP_BYTES && step <= 64) {
    const last = drive.fixes.length - 1;
    out = { ...drive, fixes: drive.fixes.filter((_, i) => i % step === 0 || i === last) };
    step *= 2;
  }
  return out;
}
