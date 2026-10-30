import type { Aircraft, Alert, Clearance } from '@towerwhisper/shared';
import { AlertRegistry } from '../src/safety/alert-registry';
import { ClearanceProbe } from '../src/safety/clearance-probe';
import { CommsWatchdog } from '../src/safety/comms-watchdog';
import { ConformanceMonitor } from '../src/safety/conformance-monitor';
import { ReadbackChecker, compare } from '../src/safety/readback-checker';

function clearance(fields: Partial<Clearance>): Clearance {
  return {
    id: 'c1',
    callsign: 'ROT301',
    speaker: 'atc',
    rawText: '',
    confidence: 1,
    parsePath: 'rules',
    ...fields,
  };
}

function aircraft(fields: Partial<Aircraft>): Aircraft {
  return {
    callsign: 'ROT301',
    telephony: 'TAROM 301',
    type: 'AT76',
    lat: 44.5,
    lon: 23.6,
    altitudeFt: 7000,
    headingDeg: 170,
    speedKt: 210,
    verticalSpeedFpm: 0,
    turnRateDegS: 0,
    target: {},
    lastContactAt: new Date().toISOString(),
    commsAgeS: 0,
    ...fields,
  };
}

function recorder(registry: AlertRegistry) {
  const raised: Alert[] = [];
  const cleared: string[] = [];
  registry.subscribe({
    raised: (a) => raised.push({ ...a }),
    cleared: (a) => cleared.push(a.type),
  });
  return { raised, cleared };
}

const instruction = clearance({
  altitude: { valueFt: 3000, action: 'descend', flightLevel: false },
  heading: { valueDeg: 120, turn: 'left' },
});

describe('ReadbackChecker', () => {
  it('accepts a correct readback', () => {
    const readback = clearance({ ...instruction, speaker: 'pilot' });
    expect(compare(instruction, readback, 'ROT301').check).toBe('ok');
  });

  it('flags a wrong altitude with both values in the message', () => {
    const registry = new AlertRegistry();
    const { raised } = recorder(registry);
    const checker = new ReadbackChecker(registry);
    const readback = clearance({
      ...instruction,
      altitude: { valueFt: 5000, action: 'descend', flightLevel: false },
    });
    expect(checker.check(instruction, readback, 'ROT301').check).toBe('mismatch');
    expect(raised[0].type).toBe('HEARBACK_MISMATCH');
    expect(raised[0].severity).toBe('warning');
    expect(raised[0].message).toBe('ROT301 cleared 3000 ft, read back 5000 ft');
  });

  it('flags the wrong turn direction', () => {
    const readback = clearance({ ...instruction, heading: { valueDeg: 120, turn: 'right' } });
    expect(compare(instruction, readback, 'ROT301').mismatches).toEqual([
      'cleared LEFT heading 120, read back RIGHT',
    ]);
  });

  it('flags a readback by another aircraft', () => {
    expect(compare(instruction, { ...instruction, callsign: 'WZZ44' }, 'WZZ44').check).toBe(
      'mismatch',
    );
  });

  it('marks a missing field as incomplete (amber)', () => {
    const registry = new AlertRegistry();
    const { raised } = recorder(registry);
    const readback = clearance({ heading: instruction.heading });
    expect(new ReadbackChecker(registry).check(instruction, readback, 'ROT301').check).toBe(
      'incomplete',
    );
    expect(raised[0]).toMatchObject({ type: 'READBACK_INCOMPLETE', severity: 'caution' });
    expect(raised[0].message).toBe('ROT301 read back heading 120; 3000 ft missing');
  });

  it('raises NO_RESPONSE 8 s after the instruction', () => {
    const registry = new AlertRegistry();
    const { raised } = recorder(registry);
    const checker = new ReadbackChecker(registry);
    checker.expect(instruction, 0);
    checker.tick(7_900);
    expect(raised).toHaveLength(0);
    checker.tick(8_000);
    expect(raised[0].type).toBe('NO_RESPONSE');
  });
});

describe('ConformanceMonitor', () => {
  it('raises WRONG_TURN only after 4 s of turning the wrong way, and clears it', () => {
    const registry = new AlertRegistry();
    const { raised, cleared } = recorder(registry);
    const monitor = new ConformanceMonitor(registry);
    monitor.watch(clearance({ heading: { valueDeg: 120, turn: 'left' } }), aircraft({}), 0);

    const wrong = aircraft({ headingDeg: 175, turnRateDegS: 3 });
    monitor.tick([wrong], 1_000);
    monitor.tick([wrong], 4_900);
    expect(raised).toHaveLength(0);
    monitor.tick([wrong], 5_000);
    expect(raised[0].type).toBe('WRONG_TURN');
    expect(raised[0].message).toBe('ROT301 cleared LEFT heading 120, turning RIGHT through 175°');

    monitor.tick([aircraft({ headingDeg: 170, turnRateDegS: -3 })], 6_000);
    expect(cleared).toContain('WRONG_TURN');
  });

  it('predicts a level bust with the seconds left', () => {
    const registry = new AlertRegistry();
    const { raised } = recorder(registry);
    const monitor = new ConformanceMonitor(registry);
    monitor.watch(clearance({ altitude: instruction.altitude }), aircraft({}), 0);
    const diving = aircraft({ altitudeFt: 3240, verticalSpeedFpm: -1800 });
    monitor.tick([diving], 1_000);
    monitor.tick([diving], 5_000);
    expect(raised[0].type).toBe('LEVEL_BUST');
    expect(raised[0].message).toBe('ROT301 will bust 3000 ft in 8 s (1800 ft/min)');
  });

  it('flags climbing when cleared to descend', () => {
    const registry = new AlertRegistry();
    const { raised } = recorder(registry);
    const monitor = new ConformanceMonitor(registry);
    monitor.watch(clearance({ altitude: instruction.altitude }), aircraft({}), 0);
    const climbing = aircraft({ altitudeFt: 7300, verticalSpeedFpm: 1800 });
    monitor.tick([climbing], 1_000);
    monitor.tick([climbing], 5_000);
    expect(raised[0].type).toBe('WRONG_VERTICAL');
  });

  it('does not alert on a normal descent and level-off', () => {
    const registry = new AlertRegistry();
    const { raised } = recorder(registry);
    const monitor = new ConformanceMonitor(registry);
    monitor.watch(clearance({ altitude: instruction.altitude }), aircraft({}), 0);
    monitor.tick([aircraft({ altitudeFt: 5000, verticalSpeedFpm: -1800 })], 3_000);
    monitor.tick([aircraft({ altitudeFt: 3250, verticalSpeedFpm: -750 })], 8_000);
    monitor.tick([aircraft({ altitudeFt: 3000, verticalSpeedFpm: 0 })], 12_000);
    expect(raised).toHaveLength(0);
  });
});

describe('CommsWatchdog', () => {
  it('goes amber, then red on the same alert, then clears', () => {
    const registry = new AlertRegistry();
    const { raised, cleared } = recorder(registry);
    const watchdog = new CommsWatchdog(registry);
    const limits = { cautionS: 900, warningS: 1800 };

    watchdog.tick([aircraft({ callsign: 'DLH9TC', commsAgeS: 960 })], limits);
    watchdog.tick([aircraft({ callsign: 'DLH9TC', commsAgeS: 1860 })], limits);
    expect(raised.map((a) => a.severity)).toEqual(['caution', 'warning']);
    expect(raised[0].id).toBe(raised[1].id);
    expect(raised[1].message).toBe('No communication with DLH9TC for 31 min (limit 30 min)');

    watchdog.tick([aircraft({ callsign: 'DLH9TC', commsAgeS: 0 })], limits);
    expect(cleared).toEqual(['NO_CONTACT']);
  });
});

describe('ClearanceProbe', () => {
  it('predicts a head-on conflict at the same level', () => {
    const registry = new AlertRegistry();
    const probe = new ClearanceProbe(registry);
    const west = aircraft({
      callsign: 'ROT301',
      lat: 44.32,
      lon: 23.5,
      headingDeg: 90,
      target: { headingDeg: 90 },
    });
    const east = aircraft({
      callsign: 'BMS12',
      lat: 44.32,
      lon: 24.1,
      headingDeg: 270,
      target: { headingDeg: 270 },
    });
    const result = probe.probe('ROT301', {}, [west, east]);
    expect(result.conflicts[0]).toMatchObject({ callsign: 'BMS12' });
    expect(result.conflicts[0].tMinS).toBeLessThan(300);
  });

  it('finds nothing with 2000 ft between them', () => {
    const probe = new ClearanceProbe(new AlertRegistry());
    const west = aircraft({ callsign: 'ROT301', lat: 44.32, lon: 23.5, headingDeg: 90 });
    const east = aircraft({
      callsign: 'BMS12',
      lat: 44.32,
      lon: 24.1,
      headingDeg: 270,
      altitudeFt: 9000,
    });
    expect(probe.probe('ROT301', {}, [west, east]).conflicts).toEqual([]);
  });
});
