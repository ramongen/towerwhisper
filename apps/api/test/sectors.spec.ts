import { generateArrivals } from '../src/sectors/arrivals';
import { SECTORS } from '../src/sectors/sectors';
import { AlertRegistry } from '../src/safety/alert-registry';
import { ClearanceProbe } from '../src/safety/clearance-probe';
import { AircraftKinematics } from '../src/simulation/aircraft-kinematics';
import { TICK_MS } from '../src/simulation/constants';
import { SimulationService } from '../src/simulation/simulation.service';

const generated = SECTORS.filter((s) => !s.definition.scenario);

describe('sectors', () => {
  it('has Craiova Approach with its hand-made scenario and unique ids', () => {
    expect(SECTORS.find((s) => s.definition.id === 'craiova-app')?.definition.scenario).toBe(
      'craiova-arrivals',
    );
    expect(new Set(SECTORS.map((s) => s.definition.id)).size).toBe(SECTORS.length);
  });

  it.each(generated.map((s) => [s.definition.id, s] as const))(
    '%s: runways, an ILS and simulated approach points',
    (_id, sector) => {
      const { airspace } = sector;
      expect(airspace.runways.length).toBeGreaterThanOrEqual(2);
      expect(airspace.runway(airspace.ilsRunway).ils).not.toBeNull();
      expect(airspace.intermediateFix()?.name).toBe(`CF${airspace.ilsRunway}`);
      // Opposite directions are 180 degrees apart.
      const [a, b] = airspace.runways;
      expect(Math.abs(((a.trueBearingDeg - b.trueBearingDeg + 540) % 360) - 180)).toBeCloseTo(180);
    },
  );

  it.each(generated.map((s) => [s.definition.id, s] as const))(
    '%s: generated arrivals all join the ILS by themselves, spaced out',
    (id, sector) => {
      const scenario = generateArrivals(id, sector.airspace);
      expect(scenario.aircraft.length).toBeGreaterThanOrEqual(4);
      expect(new Set(scenario.aircraft.map((a) => a.callsign)).size).toBe(scenario.aircraft.length);
      // Deterministic: the same traffic after every reset.
      expect(generateArrivals(id, sector.airspace)).toEqual(scenario);

      const sim = new SimulationService(new AircraftKinematics(sector.airspace));
      sim.load(scenario.aircraft, scenario.fixes);
      const requests = new Map<string, number>();
      let now = 0;
      sim.onEvent((e) => {
        if (e.type === 'landing-request' && !requests.has(e.callsign))
          requests.set(e.callsign, now);
      });
      const probe = new ClearanceProbe(new AlertRegistry(), sector.airspace.airport.lat);
      const alerts = (probe as unknown as { alerts: AlertRegistry }).alerts;
      let earlyConflicts = 0;
      const tick = (sim as unknown as { tick(): void }).tick.bind(sim);
      for (; now < 2700; now += TICK_MS / 1000) {
        tick();
        if (now < 300 && Math.round(now * 4) % 40 === 0) {
          probe.scan(sim.getAircraft());
          earlyConflicts += alerts.list().length;
        }
      }
      expect([...requests.keys()].sort()).toEqual(scenario.aircraft.map((a) => a.callsign).sort());
      expect(earlyConflicts).toBe(0);
    },
  );
});
