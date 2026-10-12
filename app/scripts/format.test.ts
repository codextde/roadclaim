import { describe, expect, test } from 'bun:test';

import { distanceParts, formatClock, formatDistance, formatDuration, formatElevation, formatSpeed } from '../src/core/format';

describe('format', () => {
  test('distance metric', () => {
    expect(formatDistance(850, 'metric')).toBe('850 m');
    expect(formatDistance(12_345, 'metric')).toBe('12.3 km');
    expect(formatDistance(345_600, 'metric')).toBe('346 km');
    expect(distanceParts(1000, 'metric')).toEqual({ value: '1.0', unit: 'km' });
  });

  test('distance imperial', () => {
    expect(formatDistance(100, 'imperial')).toBe('328 ft');
    expect(formatDistance(16_093.44, 'imperial')).toBe('10.0 mi');
  });

  test('duration', () => {
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(12 * 60 + 20)).toBe('12 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(3600 + 23 * 60)).toBe('1 h 23 min');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(65)).toBe('1:05');
  });

  test('speed and elevation', () => {
    expect(formatSpeed(25, 'metric')).toBe('90 km/h');
    expect(formatSpeed(25, 'imperial')).toBe('56 mph');
    expect(formatElevation(1234, 'metric')).toBe('1,234 m');
    expect(formatElevation(1000, 'imperial')).toBe('3,281 ft');
  });
});
