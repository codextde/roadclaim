import { requireOptionalNativeModule } from 'expo';

type EventSubscription = { remove(): void };

export type DriveActivity = {
  driving: boolean;
  since: number | null;
  activity: 'automotive' | 'cycling' | 'running' | 'walking' | 'stationary' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
};

export type DriveDetectEvent = {
  type: 'start' | 'stop' | 'wake';
  t: number;
  activity?: DriveActivity['activity'];
  confidence?: DriveActivity['confidence'];
  speed?: number;
};

export type MotionPermission = { status: 'granted' | 'denied' | 'undetermined'; granted: boolean; canAskAgain: boolean };

type Native = {
  isAvailable(): boolean;
  getPermissionStatus(): Promise<MotionPermission>;
  requestPermission(): Promise<MotionPermission>;
  start(taskName: string): Promise<void>;
  stop(taskName: string): Promise<void>;
  getCurrentActivity(): DriveActivity;
  startRecordingService(title: string, body: string): Promise<boolean>;
  updateRecordingService(title: string, body: string): Promise<void>;
  stopRecordingService(): Promise<void>;
  addListener(event: 'onDriveStart' | 'onDriveStop', cb: (e: DriveDetectEvent) => void): EventSubscription;
  addListener(event: 'onActivity', cb: (e: DriveActivity) => void): EventSubscription;
};

const DriveDetect = requireOptionalNativeModule<Native>('DriveDetect');

export default DriveDetect;
