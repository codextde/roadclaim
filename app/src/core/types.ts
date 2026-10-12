export type Fix = {
  t: number;
  lat: number;
  lng: number;
  alt: number | null;
  speed: number | null;
  heading: number | null;
  acc: number | null;
};

export type DriveEvent = {
  kind: 'brake' | 'turn_left' | 'turn_right' | 'lane_change' | 'stop';
  t: number;
  lat: number;
  lng: number;
  value?: number;
};

export type DriveMetrics = {
  distanceM: number;
  durationS: number;
  movingS: number;
  stoppedS: number;
  stops: number;
  maxSpeedMps: number;
  avgSpeedMps: number;
  elevationGainM: number;
  elevationLossM: number;
  highestM: number | null;
  steepestClimbPct: number | null;
  steepestDescentPct: number | null;
  turnsLeft: number;
  turnsRight: number;
  brakePresses: number;
  laneChanges: number;
  maxG: number;
  maxAccelMps2: number;
};

export type DriveSummary = DriveMetrics & {
  id: string;
  startedAt: string;
  endedAt: string;
  startPlace: string | null;
  endPlace: string | null;
  city: string | null;
  countryCode: string | null;
  cells: string[];
  preview: [number, number][];
  uploaded: boolean;
  territory: { claimed: number; stolen: number; refreshed: number; held: number } | null;
  sample?: boolean;
};

export type Drive = DriveSummary & {
  fixes: Fix[];
  events: DriveEvent[];
};

export type LifetimeStats = {
  distanceM: number;
  drives: number;
  activeDays: number;
  durationS: number;
  longestM: number;
  elevationGainM: number;
  brakePresses: number;
  turns: number;
  laneChanges: number;
  countries: number;
};

export type RecorderState =
  | { status: 'idle'; autoDetect: boolean }
  | { status: 'recording'; driveId: string; startedAt: string; distanceM: number; speedMps: number | null; manual: boolean }
  | { status: 'finishing'; driveId: string };

export type Permissions = {
  location: 'granted' | 'foreground' | 'denied' | 'undetermined';
  motion: 'granted' | 'denied' | 'undetermined' | 'unavailable';
  notifications: 'granted' | 'denied' | 'undetermined';
};
