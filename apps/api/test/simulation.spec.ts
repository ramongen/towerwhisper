import type { Aircraft } from '@towerwhisper/shared';
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
import { SimulationService, type SimEvent } from '../src/simulation/simulation.service';

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

  it('capture the ILS from vectors, slow down, land when cleared and leave the scope', () => {
    const sim = setup();
    const events: SimEvent[] = [];
    sim.onEvent((e) => e.callsign === 'WZZ44' && events.push(e));
    clear(sim, ILS_26_VECTORS);
    clear(sim, 'WIZZ 44, cleared to land runway 26');
    let slowest = Infinity;
    for (let t = 0; t < 1200 && sim.get('WZZ44'); t += 5) {
      run(sim, 5);
      slowest = Math.min(slowest, sim.get('WZZ44')?.speedKt ?? slowest);
    }
    expect(sim.get('WZZ44')).toBeUndefined(); // landed and left the scope
    expect(slowest).toBeLessThanOrEqual(150); // approach speed of an A321neo
    expect(events.map((e) => e.type)).toEqual(['landed']);
  });

  it('asks for landing clearance on final and goes around without it', () => {
    const sim = setup();
    const events: SimEvent[] = [];
    sim.onEvent((e) => e.callsign === 'WZZ44' && events.push(e));
    clear(sim, ILS_26_VECTORS);
    run(sim, 1200);
    expect(events.map((e) => e.type)).toEqual(['landing-request', 'go-around']);
    const a = get(sim, 'WZZ44');
    expect(a.target.approach).toBeUndefined();
    expect(a.target.altitudeFt).toBe(4000);
    expect(Math.abs(headingDelta(a.headingDeg, 269))).toBeLessThan(5); // runway heading
  });

  it('cleared to land while lined up: joins the final approach and lands', () => {
    const sim = setup();
    clear(sim, 'WIZZ 44, descend altitude 3000 feet, turn left heading 260');
    run(sim, 60);
    clear(sim, 'WIZZ 44, cleared to land runway 26');
    run(sim, 900);
    expect(sim.get('WZZ44')).toBeUndefined();
  });

  it('goes around when the controller says so', () => {
    const sim = setup();
    const events: SimEvent[] = [];
    sim.onEvent((e) => e.callsign === 'WZZ44' && events.push(e));
    clear(sim, ILS_26_VECTORS);
    run(sim, 200);
    sim.goAround('WZZ44', 'instructed');
    expect(events.map((e) => e.type)).toEqual(['go-around']);
    expect(get(sim, 'WZZ44').target.approach).toBeUndefined();
  });

  it('proceed direct to a fix, then line up on the ILS by itself', () => {
    const sim = setup();
    clear(sim, 'WIZZ 44, turn right heading 270');
    run(sim, 20);
    clear(sim, 'WIZZ 44, proceed direct OZZET');
    run(sim, 5);
    expect(get(sim, 'WZZ44').nextWaypoint).toBe('OZZET');
    let onApproach = false;
    for (let s = 0; s < 900 && !onApproach; s += 5) {
      run(sim, 5);
      expect(get(sim, 'WZZ44').holding).toBeFalsy(); // no circling over OZZET
      onApproach = get(sim, 'WZZ44').target.approach?.runway === '26';
    }
    expect(onApproach).toBe(true); // it starts the ILS 26 approach at the end of its route
  });
});
