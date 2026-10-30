import { Injectable } from '@nestjs/common';
import type { Aircraft } from '@towerwhisper/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Initial state of one aircraft as written in scenarios/*.json. */
export type ScenarioAircraft = Omit<Aircraft, 'lastContactAt' | 'commsAgeS' | 'activeClearanceId'>;

export interface Scenario {
  name: string;
  airport: string;
  aircraft: ScenarioAircraft[];
}

/** apps/api/scenarios, both from src/ (ts-jest, nest start) and from dist/ (production). */
const SCENARIOS_DIR = join(__dirname, '..', '..', 'scenarios');

@Injectable()
export class ScenarioLoader {
  load(name: string): Scenario {
    const file = join(SCENARIOS_DIR, `${name}.json`);
    return JSON.parse(readFileSync(file, 'utf-8')) as Scenario;
  }
}
