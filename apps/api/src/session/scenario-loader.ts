import { Injectable } from '@nestjs/common';
import type { Aircraft, FlightPlan, Waypoint } from '@towerwhisper/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AIRSPACE } from '../airspace/airspace';

/** Flight plan as written in the scenario file: fixes by name. */
interface FiledPlan extends Omit<FlightPlan, 'route'> {
  route: string[];
  /** The first fix still ahead of the aircraft when the scenario starts. */
  nextWaypoint: string;
}

/** Initial state of one aircraft, with its flight plan resolved to coordinates. */
export type ScenarioAircraft = Omit<
  Aircraft,
  'lastContactAt' | 'commsAgeS' | 'activeClearanceId' | 'nextWaypoint' | 'holding'
> & { flightPlan?: FlightPlan; routeIndex?: number };

export interface Scenario {
  name: string;
  airport: string;
  fixes: Waypoint[];
  aircraft: ScenarioAircraft[];
}

/** Fixes come from the real airspace (lrcv-airspace.json); a scenario names them. */
interface ScenarioFile extends Omit<Scenario, 'aircraft' | 'fixes'> {
  aircraft: (Omit<ScenarioAircraft, 'flightPlan' | 'routeIndex'> & { flightPlan: FiledPlan })[];
}

/** apps/api/scenarios, both from src/ (ts-jest, nest start) and from dist/ (production). */
const SCENARIOS_DIR = join(__dirname, '..', '..', 'scenarios');

@Injectable()
export class ScenarioLoader {
  load(name: string): Scenario {
    const file = JSON.parse(
      readFileSync(join(SCENARIOS_DIR, `${name}.json`), 'utf-8'),
    ) as ScenarioFile;
    const fixes = new Map<string, Waypoint>(
      AIRSPACE.fixes.map((f) => [f.name, { name: f.name, lat: f.lat, lon: f.lon }]),
    );
    const fix = (fixName: string): Waypoint => {
      const found = fixes.get(fixName);
      if (!found) throw new Error(`Scenario ${name}: unknown fix ${fixName}`);
      return found;
    };

    return {
      name: file.name,
      airport: file.airport,
      fixes: [...fixes.values()],
      aircraft: file.aircraft.map(({ flightPlan, ...a }) => {
        const { nextWaypoint, route, ...plan } = flightPlan;
        return {
          ...a,
          flightPlan: { ...plan, route: route.map(fix) },
          routeIndex: route.indexOf(nextWaypoint),
        };
      }),
    };
  }
}
