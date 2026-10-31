import type { AirspaceFix, AirspaceResponse, LatLon, RunwayId } from '@towerwhisper/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Geo } from '../simulation/geo';

/**
 * The airspace of one approach sector: its airport, runways (with ILS), navaids and the
 * published significant points around it. Craiova's comes from AIP Romania
 * (scripts/airspace/build-airspace.mjs); the other sectors' airports are in
 * src/sectors/airports.ts. Plain data plus the local flat-earth projection around the airport.
 */
export interface AirspaceData {
  source: string;
  airport: AirspaceResponse['airport'];
  runways: {
    id: RunwayId;
    trueBearingDeg: number;
    threshold: { lat: number; lon: number };
    lengthM: number;
    widthM: number;
    ils: { ident: string; frequencyMhz: string; category: string; glideSlopeDeg: number } | null;
  }[];
  navaids: AirspaceResponse['navaids'];
  fixes: AirspaceFix[];
  /** Runway in use when calm (arrivals fly its ILS); the first ILS runway when absent. */
  defaultRunway?: RunwayId;
}

export type Runway = AirspaceData['runways'][number];

export class Airspace {
  readonly geo: Geo;
  /** The runway with an ILS: the default when there is no wind to choose by. */
  readonly ilsRunway: RunwayId;

  constructor(readonly data: AirspaceData) {
    this.geo = new Geo(data.airport);
    this.ilsRunway =
      data.defaultRunway ?? data.runways.find((r) => r.ils)?.id ?? data.runways[0].id;
  }

  get airport(): AirspaceData['airport'] {
    return this.data.airport;
  }

  get runways(): Runway[] {
    return this.data.runways;
  }

  get fixes(): AirspaceFix[] {
    return this.data.fixes;
  }

  runway(id: RunwayId): Runway {
    const found = this.data.runways.find((r) => r.id === id);
    if (!found) throw new Error(`Unknown runway ${id} at ${this.data.airport.icao}`);
    return found;
  }

  isRunwayId(value: string): boolean {
    return this.data.runways.some((r) => r.id === value);
  }

  /** The opposite direction of a runway ('26' -> '08'); the other runway when that is unknown. */
  otherRunway(id: RunwayId): RunwayId {
    const own = this.data.runways.find((r) => r.id === id);
    const opposite = own
      ? this.data.runways.find(
          (r) =>
            r.id !== id &&
            Math.abs(((r.trueBearingDeg - own.trueBearingDeg + 540) % 360) - 180) < 20,
        )
      : undefined;
    return (opposite ?? this.data.runways.find((r) => r.id !== id) ?? this.data.runways[0]).id;
  }

  fix(name: string): AirspaceFix | undefined {
    return this.data.fixes.find((f) => f.name === name);
  }

  /** The intermediate fix where the ILS approach starts (OZZET for Craiova). */
  intermediateFix(): AirspaceFix | undefined {
    return this.data.fixes.find((f) => f.role === 'IF');
  }

  distanceNm(a: LatLon, b: LatLon): number {
    const p = this.geo.toXy(a);
    const q = this.geo.toXy(b);
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  /** GET /airspace for the scope. */
  toResponse(): AirspaceResponse {
    return {
      airport: this.data.airport,
      runways: this.data.runways.map((r) => ({
        id: r.id,
        headingDeg: r.trueBearingDeg,
        threshold: r.threshold,
        lengthM: r.lengthM,
        widthM: r.widthM,
        ils: r.ils ? { ident: r.ils.ident, frequencyMhz: r.ils.frequencyMhz } : null,
      })),
      navaids: this.data.navaids,
      fixes: this.data.fixes,
      source: this.data.source,
    };
  }
}

/** apps/api/scenarios, from src/ (ts-jest, nest start) and from dist/ (production). */
const FILE = join(__dirname, '..', '..', 'scenarios', 'lrcv-airspace.json');

/** Craiova (LRCV) and every ENR 4.4 significant point within 130 NM of it, from AIP Romania. */
export const LRCV_AIRSPACE_DATA: AirspaceData = JSON.parse(
  readFileSync(FILE, 'utf-8'),
) as AirspaceData;

/** Craiova Approach: the scenario sector, and the default wherever no sector is given. */
export const CRAIOVA = new Airspace(LRCV_AIRSPACE_DATA);
