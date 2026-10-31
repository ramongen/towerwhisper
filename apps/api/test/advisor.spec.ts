import type { Aircraft, AirportWeather, Clearance, FlightPlan, Targets } from '@towerwhisper/shared';
import { NextCallAdvisor, type AdvisoryContext } from '../src/advisor/next-call-advisor';
import { CRAIOVA } from '../src/airspace/airspace';
import { CallsignResolver } from '../src/parser/callsign-resolver';
import type { LlmParser } from '../src/parser/llm-parser';
import { ParserService } from '../src/parser/parser.service';
import { PhraseNormalizer } from '../src/parser/phrase-normalizer';
import { RuleParser } from '../src/parser/rule-parser';
import { targetsFor } from '../src/pilot/targets';
import { SECTORS } from '../src/sectors/sectors';
import { ScenarioLoader } from '../src/session/scenario-loader';
import { AircraftKinematics } from '../src/simulation/aircraft-kinematics';
import { TICK_MS } from '../src/simulation/constants';
import { SimulationService } from '../src/simulation/simulation.service';

const parser = new ParserService(
  new PhraseNormalizer(),
  new RuleParser(),
  null as unknown as LlmParser,
  new CallsignResolver(),
);
const advisor = new NextCallAdvisor(CRAIOVA);
const RWY = CRAIOVA.runway('26');
const COURSE = RWY.trueBearingDeg;

/** A point on the runway 26 final: NM before the threshold, NM left (+) / right (-) of it. */
function onFinal(alongNm: number, crossNm: number): { lat: number; lon: number } {
  const t = CRAIOVA.geo.toXy(RWY.threshold);
  const rad = (COURSE * Math.PI) / 180;
  const u = { x: Math.sin(rad), y: Math.cos(rad) };
  const left = { x: -Math.cos(rad), y: Math.sin(rad) };
  return CRAIOVA.geo.toLatLon({
    x: t.x - u.x * alongNm + left.x * crossNm,
    y: t.y - u.y * alongNm + left.y * crossNm,
  });
}

function aircraft(at: { lat: number; lon: number }, headingDeg: number, extra: Partial<Aircraft> = {}): Aircraft {
  return {
    callsign: 'ROT301',
    telephony: 'TAROM 301',
    type: 'AT76',
    ...at,
    altitudeFt: 3000,
    headingDeg,
    speedKt: 160,
    verticalSpeedFpm: 0,
    turnRateDegS: 0,
    target: {},
    lastContactAt: new Date().toISOString(),
    commsAgeS: 0,
    ...extra,
  };
}

const plan = (...names: string[]): FlightPlan => ({
  departure: 'LROP',
  destination: 'LRCV',
  route: names.map((n) => CRAIOVA.fix(n)!),
  cruiseLevel: 120,
  declaredLandingWeightKg: 18000,
});

const weather = {
  windDirDeg: 250,
  windSpeedKt: 5,
  windGustKt: null,
  preferredRunway: '26',
  runwayWind: [{ runway: '26', headwindKt: 5, crosswindKt: -2 }],
} as unknown as AirportWeather;

function ctx(extra: Partial<AdvisoryContext> = {}): AdvisoryContext {
  return { remainingRoute: [], weather, sinceAtcMs: null, ...extra };
}

/** The advised phrase, through the same parser as a spoken instruction. */
async function parse(a: Aircraft, phrase: string): Promise<Clearance> {
  const clearance = await parser.parse({
    text: phrase,
    speaker: 'atc',
    candidates: [a],
    selectedCallsign: null,
    fixes: CRAIOVA.fixes.map((f) => f.name),
  });
  expect(clearance).not.toBeNull();
  expect(clearance!.callsign).toBe(a.callsign);
  return clearance!;
}

describe('NextCallAdvisor', () => {
  const approach: Targets = { approach: { type: 'ILS', runway: '26' } };

  it('advises the landing clearance on final, with the wind, as a phrase the parser reads', async () => {
    const a = aircraft(onFinal(6, 0.2), COURSE, { target: approach });
    const advice = advisor.advise(a, ctx())!;
    expect(advice.kind).toBe('landing-clearance');
    expect(advice.phrase).toBe('TAROM 301, cleared to land runway 26, wind 250 degrees 5 knots');
    expect(advice.reason).toMatch(/goes around at 1.5 NM/);
    expect(advice.urgency).toBe('normal');
    const c = await parse(a, advice.phrase);
    expect(c.landing?.runway).toBe('26');
  });

  it('is urgent when the go-around is less than 90 s away', () => {
    const a = aircraft(onFinal(4, 0), COURSE, { target: approach });
    expect(advisor.advise(a, ctx())!.urgency).toBe('urgent');
  });

  it('gives no advice once cleared to land, or just after the controller called', () => {
    const cleared = aircraft(onFinal(6, 0), COURSE, { target: { ...approach, landingCleared: true } });
    expect(advisor.advise(cleared, ctx())).toBeUndefined();
    const busy = aircraft(onFinal(6, 0), COURSE, { target: approach });
    expect(advisor.advise(busy, ctx({ sinceAtcMs: 3000 }))).toBeUndefined();
  });

  it('clears an arrival on its flight plan for the approach before the IF', async () => {
    const ozzet = CRAIOVA.fix('OZZET')!;
    const titek = CRAIOVA.fix('TITEK')!;
    const mid = { lat: (ozzet.lat + titek.lat) / 2, lon: (ozzet.lon + titek.lon) / 2 };
    const a = aircraft(mid, 0, { altitudeFt: 4000, target: { altitudeFt: 4000 }, nextWaypoint: 'OZZET' });
    const advice = advisor.advise(
      a,
      ctx({ flightPlan: plan('OVDOT', 'TITEK', 'OZZET'), remainingRoute: [ozzet] }),
    )!;
    expect(advice.kind).toBe('approach-clearance');
    expect(advice.phrase).toBe('TAROM 301, cleared ILS approach runway 26');
    expect(advice.basis.join(' ')).toMatch(/OVDOT TITEK OZZET/);
    const c = await parse(a, advice.phrase);
    expect(c.approach).toEqual({ type: 'ILS', runway: '26' });
  });

  it('descends an aircraft holding too high over the IF and clears it for the approach', async () => {
    const ozzet = CRAIOVA.fix('OZZET')!;
    const a = aircraft(ozzet, 90, { altitudeFt: 9000, target: { altitudeFt: 9000 }, holding: true, nextWaypoint: 'OZZET' });
    const advice = advisor.advise(a, ctx({ remainingRoute: [ozzet] }))!;
    expect(advice.kind).toBe('approach-clearance');
    expect(advice.urgency).toBe('urgent');
    const c = await parse(a, advice.phrase);
    expect(c.altitude?.action).toBe('descend');
    expect(c.altitude!.valueFt).toBeLessThan(6000);
    expect(c.approach?.runway).toBe('26');
  });

  it('on vectors on the arrival side, proposes the best fix of the flight plan back to the ILS', async () => {
    const titek = CRAIOVA.fix('TITEK')!;
    const a = aircraft(
      { lat: titek.lat + 0.12, lon: titek.lon + 0.05 },
      360,
      { altitudeFt: 6000, target: { headingDeg: 360, altitudeFt: 6000 } },
    );
    const advice = advisor.advise(a, ctx({ flightPlan: plan('OVDOT', 'TITEK', 'OZZET') }))!;
    expect(advice.kind).toBe('direct-to');
    expect(['TITEK', 'OZZET']).toContain(advice.title.replace('Direct ', ''));
    expect(advice.reason).toMatch(/shortest way back to the ILS 26/);
    const c = await parse(a, advice.phrase);
    expect(c.direct?.fix).toBe(advice.title.replace('Direct ', ''));
  });

  it('after a go-around, turns it crosswind (right-hand circuit)', async () => {
    const a = aircraft(onFinal(-2, 0), COURSE, {
      altitudeFt: 2500,
      target: { altitudeFt: 4000, speedKt: 220 },
      nextWaypoint: 'GA CLIMB',
    });
    const advice = advisor.advise(a, ctx())!;
    expect(advice.kind).toBe('vectors');
    expect(advice.title).toBe('Crosswind');
    expect(advice.urgency).toBe('urgent');
    expect(advice.phrase).toBe('TAROM 301, turn right heading 360');
    const c = await parse(a, advice.phrase);
    expect(c.heading).toEqual({ valueDeg: 360, turn: 'right' });
  });

  it('turns downwind once abeam, and stays quiet while it already flies downwind', () => {
    const crosswind = aircraft(onFinal(2, -6), 0, { target: { headingDeg: 360 } });
    const advice = advisor.advise(crosswind, ctx())!;
    expect(advice.title).toBe('Downwind');
    expect(advice.phrase).toBe('TAROM 301, turn right heading 090');
    const downwind = aircraft(onFinal(2, -6), 90, { target: { headingDeg: 90 } });
    expect(advisor.advise(downwind, ctx())).toBeUndefined();
  });

  it('on base close to the centreline, gives the 30 degree intercept with the approach clearance', async () => {
    const a = aircraft(onFinal(14, -3), 180, { target: { headingDeg: 180 } });
    const advice = advisor.advise(a, ctx())!;
    expect(advice.title).toBe('Intercept and clear for the ILS');
    expect(advice.phrase).toBe('TAROM 301, turn right heading 240, cleared ILS approach runway 26');
    const c = await parse(a, advice.phrase);
    expect(c.heading).toEqual({ valueDeg: 240, turn: 'right' });
    expect(c.approach).toEqual({ type: 'ILS', runway: '26' });
  });

  it('works in the generated sectors too (their IF is a parsable fix)', async () => {
    for (const sector of SECTORS.filter((s) => !s.definition.scenario)) {
      const airspace = sector.airspace;
      const intermediate = airspace.intermediateFix()!;
      const iaf = airspace.fixes.find((f) => f.role === 'IAF')!;
      const a = aircraft({ lat: iaf.lat + 0.1, lon: iaf.lon }, 0, { target: { headingDeg: 360 } });
      const advice = new NextCallAdvisor(airspace).advise(a, {
        remainingRoute: [],
        weather: null,
        sinceAtcMs: null,
        flightPlan: { ...plan(), route: [iaf, intermediate] },
      });
      expect(advice).toBeDefined();
      const clearance = await parser.parse({
        text: advice!.phrase,
        speaker: 'atc',
        candidates: [a],
        selectedCallsign: null,
        fixes: airspace.fixes.map((f) => f.name),
      });
      expect(clearance).not.toBeNull();
    }
  });

  it('a controller who says every advice lands the whole Craiova scenario, a go-around included', async () => {
    jest.useFakeTimers();
    try {
      const sim = new SimulationService(new AircraftKinematics(CRAIOVA));
      const scenario = new ScenarioLoader().load('craiova-arrivals', CRAIOVA);
      sim.load(scenario.aircraft, scenario.fixes);
      const events: string[] = [];
      sim.onEvent((e) => events.push(`${e.type} ${e.callsign}`));
      const lastAtc = new Map<string, number>();
      const said = new Map<string, string>();
      const kinds: string[] = [];
      let ignoredLanding = false;
      sim.start();
      // 40 simulated minutes; every 5 s the advice is said, and flown 4 s later.
      for (let s = 0; s < 40 * 60 && sim.getAircraft().length; s += 5) {
        const now = sim.simNowMs();
        const aircraft = sim.getAircraft();
        for (const a of aircraft) {
          const last = lastAtc.get(a.callsign);
          const advice = advisor.advise(a, {
            flightPlan: sim.getFlightPlan(a.callsign),
            remainingRoute: sim.getRemainingRoute(a.callsign),
            weather: null,
            sinceAtcMs: last === undefined ? null : now - last,
          });
          if (!advice || said.get(a.callsign) === advice.id) continue;
          said.set(a.callsign, advice.id);
          // WIZZ 44's first landing clearance is "forgotten": it goes around.
          if (a.callsign === 'WZZ44' && advice.kind === 'landing-clearance' && !ignoredLanding) {
            ignoredLanding = true;
            continue;
          }
          const c = await parser.parse({
            text: advice.phrase,
            speaker: 'atc',
            candidates: aircraft,
            selectedCallsign: null,
            fixes: CRAIOVA.fixes.map((f) => f.name),
          });
          expect(c).not.toBeNull();
          kinds.push(`${a.callsign} ${advice.kind}`);
          lastAtc.set(a.callsign, now);
          setTimeout(() => sim.setTargets(a.callsign, targetsFor(c!, CRAIOVA), c!.id), 4000);
        }
        jest.advanceTimersByTime((5000 / TICK_MS) * TICK_MS);
      }
      sim.stop();
      expect(sim.getAircraft()).toEqual([]);
      expect(events.filter((e) => e.startsWith('landed'))).toHaveLength(6);
      expect(events).toContain('go-around WZZ44');
      expect(events.filter((e) => e.startsWith('go-around'))).toHaveLength(1);
      expect(kinds).toContain('WZZ44 vectors');
    } finally {
      jest.useRealTimers();
    }
  });
});
