import { cellToBoundary, cellToLatLng } from 'h3-js';
import type { LatLng, Region } from 'react-native-maps';

import type { Bbox } from '@/ui-lib/remote';

const boundaries = new Map<string, LatLng[]>();
const centers = new Map<string, [number, number]>();

export function boundaryOf(cell: string): LatLng[] {
  let coords = boundaries.get(cell);
  if (!coords) {
    coords = cellToBoundary(cell).map(([latitude, longitude]) => ({ latitude, longitude }));
    boundaries.set(cell, coords);
  }
  return coords;
}

export function centerOf(cell: string): [number, number] {
  let center = centers.get(cell);
  if (!center) {
    center = cellToLatLng(cell);
    centers.set(cell, center);
  }
  return center;
}

export function regionBbox(r: Region, pad = 0): Bbox {
  const dLat = (r.latitudeDelta / 2) * (1 + pad);
  const dLng = (r.longitudeDelta / 2) * (1 + pad);
  return { minLat: r.latitude - dLat, maxLat: r.latitude + dLat, minLng: r.longitude - dLng, maxLng: r.longitude + dLng };
}

export function inBbox(cell: string, b: Bbox) {
  const [lat, lng] = centerOf(cell);
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export function regionForPoints(points: [number, number][]): Region | null {
  if (points.length === 0) return null;
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const [lat, lng] of points) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.min(0.5, Math.max(0.03, (maxLat - minLat) * 1.4)),
    longitudeDelta: Math.min(0.5, Math.max(0.03, (maxLng - minLng) * 1.4)),
  };
}
