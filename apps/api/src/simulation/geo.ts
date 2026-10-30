import type { LatLon } from '@towerwhisper/shared';
import { LRCV } from '../session/constants';

/** Local flat-earth approximation around LRCV (good enough within ~50 NM). x = east, y = north, in NM. */
const COS_LAT0 = Math.cos((LRCV.lat * Math.PI) / 180);

export interface Xy {
  x: number;
  y: number;
}

export function toXy(p: LatLon): Xy {
  return { x: (p.lon - LRCV.lon) * 60 * COS_LAT0, y: (p.lat - LRCV.lat) * 60 };
}

export function toLatLon(p: Xy): LatLon {
  return { lat: LRCV.lat + p.y / 60, lon: LRCV.lon + p.x / (60 * COS_LAT0) };
}

/** Velocity in NM/s for a heading (degrees true) and ground speed (kt). */
export function velocity(headingDeg: number, speedKt: number): Xy {
  const rad = (headingDeg * Math.PI) / 180;
  const nmPerS = speedKt / 3600;
  return { x: Math.sin(rad) * nmPerS, y: Math.cos(rad) * nmPerS };
}

/** Signed difference target - current in (-180, 180]. */
export function headingDelta(current: number, target: number): number {
  const d = ((((target - current) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

export function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
