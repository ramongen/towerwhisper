import type { SectorInfo } from '@towerwhisper/shared';
import { Airspace, CRAIOVA } from '../airspace/airspace';
import { airspaceFor } from './airports';

/**
 * Approach sectors of Romanian airspace (ROMATSA approach units) that can be worked in the
 * app. Each runs its own live session: traffic, comms, alerts, demo faults and recording.
 * Craiova Approach has the hand-made demo scenario; the others get generated arrivals.
 */
export interface SectorDefinition extends Omit<SectorInfo, 'airport' | 'runways' | 'ilsRunway'> {
  /** Hand-made scenario file in apps/api/scenarios; generated arrivals when absent. */
  scenario?: string;
}

const DEFINITIONS: SectorDefinition[] = [
  {
    id: 'craiova-app',
    name: 'Craiova Approach',
    shortName: 'CRAIOVA APP',
    towerCallsign: 'Craiova Tower',
    airportIcao: 'LRCV',
    scenario: 'craiova-arrivals',
  },
  {
    id: 'bucuresti-app',
    name: 'București Approach',
    shortName: 'BUCURESTI APP',
    towerCallsign: 'Otopeni Tower',
    airportIcao: 'LROP',
  },
  {
    id: 'timisoara-app',
    name: 'Timișoara Approach',
    shortName: 'TIMISOARA APP',
    towerCallsign: 'Timisoara Tower',
    airportIcao: 'LRTR',
  },
  {
    id: 'cluj-app',
    name: 'Cluj Approach',
    shortName: 'CLUJ APP',
    towerCallsign: 'Cluj Tower',
    airportIcao: 'LRCL',
  },
  {
    id: 'oradea-app',
    name: 'Oradea Approach',
    shortName: 'ORADEA APP',
    towerCallsign: 'Oradea Tower',
    airportIcao: 'LROD',
  },
];

export const DEFAULT_SECTOR_ID = 'craiova-app';

export interface Sector {
  definition: SectorDefinition;
  airspace: Airspace;
  info: SectorInfo;
}

/** Every sector with its airspace, built once at startup. */
export const SECTORS: Sector[] = DEFINITIONS.map((definition) => {
  const airspace =
    definition.airportIcao === 'LRCV' ? CRAIOVA : new Airspace(airspaceFor(definition.airportIcao));
  const { id, name, shortName, towerCallsign, airportIcao } = definition;
  return {
    definition,
    airspace,
    info: {
      id,
      name,
      shortName,
      towerCallsign,
      airportIcao,
      airport: {
        icao: airspace.airport.icao,
        name: airspace.airport.name,
        lat: airspace.airport.lat,
        lon: airspace.airport.lon,
      },
      runways: airspace.runways.map((r) => r.id),
      ilsRunway: airspace.ilsRunway,
    },
  };
});

export function findSector(id: string | null | undefined): Sector | undefined {
  return SECTORS.find((s) => s.definition.id === id);
}

export function isSectorId(id: unknown): id is string {
  return typeof id === 'string' && SECTORS.some((s) => s.definition.id === id);
}
