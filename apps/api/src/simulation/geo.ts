import type { LatLon } from '@towerwhisper/shared';

export interface Xy {
  x: number;
  y: number;
}

/**
 * Local flat-earth approximation around an airport (good enough within ~50 NM).
 * x = east, y = north, in NM from the origin. Each sector has its own, centred on its airport.
 */
export class Geo {
  private readonly cosLat0: number;

  constructor(private readonly origin: LatLon) {
    this.cosLat0 = Math.cos((origin.lat * Math.PI) / 180);
  }

  toXy(p: LatLon): Xy {
    return { x: (p.lon - this.origin.lon) * 60 * this.cosLat0, y: (p.lat - this.origin.lat) * 60 };
  }

  toLatLon(p: Xy): LatLon {
    return {
      lat: this.origin.lat + p.y / 60,
      lon: this.origin.lon + p.x / (60 * this.cosLat0),
    };
  }
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

/** Bearing (degrees true) from one point to another, in a local projection. */
export function bearing(from: Xy, to: Xy): number {
  return normalizeHeading((Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI);
}
