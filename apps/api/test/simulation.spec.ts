import type { Aircraft } from '@towerwhisper/shared';
import { ClearanceProbe } from '../src/safety/clearance-probe';
import { AlertRegistry } from '../src/safety/alert-registry';
import { CallsignResolver } from '../src/parser/callsign-resolver';
import type { LlmParser } from '../src/parser/llm-parser';
import { ParserService } from '../src/parser/parser.service';
import { PhraseNormalizer } from '../src/parser/phrase-normalizer';
import { RuleParser } from '../src/parser/rule-parser';
import { targetsFor } from '../src/pilot/targets';
import { ScenarioLoader } from '../src/session/scenario-loader';
import { AircraftKinematics } from '../src/simulation/aircraft-kinematics';
import { TICK_MS } from '../src/simulation/constants';
import { headingDelta } from '../src/simulation/geo';
import { SimulationService } from '../src/simulation/simulation.service';

const scenario = new ScenarioLoader().load('craiova-arrivals');
/** WZZ44 comes from the east: a left turn onto a 30 degree intercept of the runway 26 localizer. */
const ILS_26_VECTORS =
  'WIZZ 44, descend altitude 4000 feet, turn left heading 240, cleared ILS approach runway 26';
const parser = new ParserService(
  new PhraseNormalizer(),
  new RuleParser(),
  null as unknown as LlmParser,
  new CallsignResolver(),
);

function setup(): SimulationService {
  const sim = new SimulationService(new AircraftKinematics());
  sim.load(scenario.aircraft, scenario.fixes);
  return sim;
}

/** Advance simulation time without the real interval timer. */
function run(sim: SimulationService, seconds: number): void {
  const tick = (sim as unknown as { tick(): void }).tick.bind(sim);
  for (let t = 0; t < seconds; t += TICK_MS / 1000) tick();
}

/** What PilotService does after a correct readback: fly exactly the cleared values. */
function clear(sim: SimulationService, text: string): void {
  const c = parser.parseWithRules({
    text,
    speaker: 'atc',
    candidates: sim.getAircraft(),
    fixes: scenario.fixes.map((f) => f.name),
  });
  if (!c) throw new Error(`not parsed: ${text}`);
  sim.setTargets(c.callsign, targetsFor(c), c.id);
}

function get(sim: SimulationService, callsign: string): Aircraft {
  const a = sim.get(callsign);
  if (!a) throw new Error(`${callsign} not in the simulation`);
  return a;
}

describe('aircraft follow their instructions', () => {
  it('fly their flight plan towards the next fix without instructions', () => {
    const sim = setup();
    run(sim, 30);
    const a = get(sim, 'ROT301');
    expect(a.nextWaypoint).toBe('TITEK');
    const kovad = scenario.fixes.find((f) => f.name === 'TITEK')!;
    const bearing = (Math.atan2((kovad.lon - a.lon) * 0.716, kovad.lat - a.lat) * 180) / Math.PI;
    expect(Math.abs(headingDelta(a.headingDeg, bearing))).toBeLessThan(5);
  });

  it('turn the cleared way to the cleared heading, descend and slow down', () => {
    const sim = setup();
    clear(sim, 'TAROM 301, descend altitude 3000 feet, turn left heading 060, reduce speed 180');
    run(sim, 1);
    expect(get(sim, 'ROT301').turnRateDegS).toBeLessThan(0);
    run(sim, 180);
    const a = get(sim, 'ROT301');
    expect(a.headingDeg).toBe(60);
    expect(a.altitudeFt).toBe(3000);
    expect(a.speedKt).toBe(180);
    expect(a.nextWaypoint).toBeUndefined(); // on vectors now
  });

  it('take the long way round when told to turn right', () => {
    const sim = setup();
    clear(sim, 'TAROM 301, turn right heading 060');
    run(sim, 1);
    expect(get(sim, 'ROT301').turnRateDegS).toBeGreaterThan(0);
  });

  it('a new heading takes an aircraft off the ILS it had captured', () => {
    const sim = setup();
    clear(sim, ILS_26_VECTORS);
    run(sim, 200);
    const onLocalizer = get(sim, 'WZZ44');
    expect(onLocalizer.target.approach).toBeDefined();
    expect(Math.abs(headingDelta(onLocalizer.headingDeg, 269))).toBeLessThan(35);
    clear(sim, 'WIZZ 44, turn left heading 180');
    run(sim, 150);
    const a = get(sim, 'WZZ44');
    expect(a.target.approach).toBeUndefined();
    expect(a.headingDeg).toBe(180);
  });

  it('capture the ILS from vectors and land', () => {
    const sim = setup();
    clear(sim, ILS_26_VECTORS);
    run(sim, 1200);
    expect(sim.get('WZZ44')).toBeUndefined(); // landed and left the scope
  });

  it('proceed direct to a fix and hold over the end of the route', () => {
    const sim = setup();
    clear(sim, 'WIZZ 44, turn right heading 270');
    run(sim, 20);
    clear(sim, 'WIZZ 44, proceed direct OZZET');
    run(sim, 5);
    expect(get(sim, 'WZZ44').nextWaypoint).toBe('OZZET');
    run(sim, 900);
    const a = get(sim, 'WZZ44');
    expect(a.holding).toBe(true);
    expect(a.turnRateDegS).toBeGreaterThan(0); // orbiting right
  });

  it('the scenario has no conflict before the controller does anything', () => {
    const sim = setup();
    const alerts = new AlertRegistry();
    const probe = new ClearanceProbe(alerts);
    for (let s = 0; s < 600; s += 30) {
      run(sim, 30);
      probe.scan(sim.getAircraft());
    }
    expect(alerts.list()).toEqual([]);
  });
});
