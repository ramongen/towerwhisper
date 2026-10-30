import type { SimAircraft } from '../src/simulation/aircraft-kinematics';
import { AircraftKinematics } from '../src/simulation/aircraft-kinematics';

function aircraft(overrides: Partial<SimAircraft> = {}): SimAircraft {
  return {
    callsign: 'ROT301',
    telephony: 'TAROM 301',
    type: 'AT76',
    lat: 44.53,
    lon: 23.59,
    altitudeFt: 7000,
    headingDeg: 170,
    speedKt: 210,
    verticalSpeedFpm: 0,
    turnRateDegS: 0,
    target: { altitudeFt: 7000, headingDeg: 170, speedKt: 210 },
    lastContactAt: new Date().toISOString(),
    commsAgeS: 0,
    ...overrides,
  };
}

function run(k: AircraftKinematics, a: SimAircraft, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.25) k.step(a, 0.25);
}

describe('AircraftKinematics', () => {
  const k = new AircraftKinematics();

  it('turns left at standard rate when cleared left', () => {
    const a = aircraft({ target: { headingDeg: 120, turnDir: 'left' } });
    k.step(a, 0.25);
    expect(a.turnRateDegS).toBeCloseTo(-3);
    run(k, a, 20);
    expect(a.headingDeg).toBe(120);
    expect(a.turnRateDegS).toBe(0);
  });

  it('takes the long way round when told to turn right', () => {
    const a = aircraft({ target: { headingDeg: 120, turnDir: 'right' } });
    k.step(a, 0.25);
    expect(a.turnRateDegS).toBeGreaterThan(0);
  });

  it('descends at 1500-2000 ft/min and levels off without overshooting', () => {
    const a = aircraft({ target: { altitudeFt: 3000 } });
    k.step(a, 0.25);
    expect(a.verticalSpeedFpm).toBeLessThanOrEqual(-1500);
    expect(a.verticalSpeedFpm).toBeGreaterThanOrEqual(-2000);
    run(k, a, 240);
    expect(a.altitudeFt).toBe(3000);
    expect(a.verticalSpeedFpm).toBe(0);
  });

  it('is below 1000 ft/min within 300 ft of the target (no false LEVEL_BUST)', () => {
    const a = aircraft({ altitudeFt: 3290, target: { altitudeFt: 3000 } });
    k.step(a, 0.25);
    expect(Math.abs(a.verticalSpeedFpm)).toBeLessThan(1000);
  });

  it('changes speed at 2 kt/s', () => {
    const a = aircraft({ target: { speedKt: 180 } });
    run(k, a, 5);
    expect(a.speedKt).toBeCloseTo(200);
  });
});
