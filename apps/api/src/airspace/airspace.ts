import type { AirspaceFix, AirspaceResponse, RunwayId } from '@towerwhisper/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Real airspace around LRCV, built from AIP Romania by scripts/airspace/build-airspace.mjs:
 * the runway (08/26), the ILS (runway 26), the CRV VOR and every published significant
 * point within 130 NM. Loaded once; plain data, so any module can import it.
 */
interface AirspaceFile {
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
}

/** apps/api/scenarios, from src/ (ts-jest, nest start) and from dist/ (production). */
const FILE = join(__dirname, '..', '..', 'scenarios', 'lrcv-airspace.json');

export const AIRSPACE: AirspaceFile = JSON.parse(readFileSync(FILE, 'utf-8')) as AirspaceFile;

export type Runway = AirspaceFile['runways'][number];

export function runway(id: RunwayId): Runway {
  const found = AIRSPACE.runways.find((r) => r.id === id);
  if (!found) throw new Error(`Unknown runway ${id}`);
  return found;
}

export const RUNWAY_IDS = AIRSPACE.runways.map((r) => r.id);

export function isRunwayId(value: string): value is RunwayId {
  return (RUNWAY_IDS as string[]).includes(value);
}

/** The runway with an ILS: the default when there is no wind to choose by. */
export const ILS_RUNWAY: RunwayId = AIRSPACE.runways.find((r) => r.ils)?.id ?? RUNWAY_IDS[0];

export function fix(name: string): AirspaceFix | undefined {
  return AIRSPACE.fixes.find((f) => f.name === name);
}
