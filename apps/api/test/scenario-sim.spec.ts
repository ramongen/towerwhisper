import { ScenarioLoader } from '../src/session/scenario-loader';
import { AlertRegistry } from '../src/safety/alert-registry';
import { ClearanceProbe } from '../src/safety/clearance-probe';
import { AircraftKinematics } from '../src/simulation/aircraft-kinematics';
import { TICK_MS } from '../src/simulation/constants';
import { SimulationService, type SimEvent } from '../src/simulation/simulation.service';

/** The scenario left alone: arrivals fly their routes, descend, start the approach and ask to land. */
describe('scenario without any instruction', () => {
  const scenario = new ScenarioLoader().load('craiova-arrivals');

  /** Simulation time (s) of each aircraft's first landing request. */
  function requestTimes(seconds: number): Map<string, number> {
    const sim = new SimulationService(new AircraftKinematics());
    sim.load(scenario.aircraft, scenario.fixes);
    const times = new Map<string, number>();
    let now = 0;
    sim.onEvent((e) => {
      if (e.type === 'landing-request' && !times.has(e.callsign)) times.set(e.callsign, now);
    });
    const tick = (sim as unknown as { tick(): void }).tick.bind(sim);
    for (; now < seconds; now += TICK_MS / 1000) tick();
    return times;
  }

  function runScenario(seconds: number) {
    const sim = new SimulationService(new AircraftKinematics());
    sim.load(scenario.aircraft, scenario.fixes);
    const events: SimEvent[] = [];
    sim.onEvent((e) => events.push(e));
    const alerts = new AlertRegistry();
    const probe = new ClearanceProbe(alerts);
    const conflicts = new Set<string>();
    const tick = (sim as unknown as { tick(): void }).tick.bind(sim);
    for (let t = 0; t < seconds; t += TICK_MS / 1000) {
      tick();
      if (Math.round(t * 4) % 40 === 0) {
        probe.scan(sim.getAircraft());
        for (const a of alerts.list()) conflicts.add(a.callsigns.join('/'));
      }
    }
    return { sim, events, conflicts };
  }

  it('has no conflict during the first 15 minutes (later the controller sequences them)', () => {
    expect([...runScenario(900).conflicts]).toEqual([]);
  });

  it('spaces the arrivals about 4 minutes apart on final', () => {
    const times = [...requestTimes(1800).values()].sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++)
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(200);
  });

  it('brings every arrival onto the ILS by itself (no circling forever)', () => {
    const { events } = runScenario(1800);
    const requested = new Set(
      events.filter((e) => e.type === 'landing-request').map((e) => e.callsign),
    );
    expect([...requested].sort()).toEqual(scenario.aircraft.map((a) => a.callsign).sort());
  });
});
