import type { Aircraft, Clearance, FaultConfig, Targets } from '@towerwhisper/shared';
import { DEFAULT_OVERSHOOT_FT, WRONG_VERTICAL_FT } from '../demo/constants';
import { MIN_TARGET_ALTITUDE_FT } from './constants';

type ExecutionFault = NonNullable<FaultConfig['execution']>;

/** What the simulator should fly for a clearance: exactly the cleared values. */
export function targetsFor(clearance: Clearance): Targets {
  const targets: Targets = {};
  if (clearance.altitude) targets.altitudeFt = clearance.altitude.valueFt;
  if (clearance.heading) {
    targets.headingDeg = clearance.heading.valueDeg % 360;
    targets.turnDir = clearance.heading.turn;
  }
  if (clearance.speed) targets.speedKt = clearance.speed.valueKt;
  if (
    clearance.approach &&
    (clearance.approach.runway === '09' || clearance.approach.runway === '27')
  ) {
    targets.approach = { type: 'ILS', runway: clearance.approach.runway };
  }
  return targets;
}

/** Whether an execution fault can change this clearance (e.g. a level bust needs a level). */
export function executionFaultApplies(fault: ExecutionFault, clearance: Clearance): boolean {
  switch (fault.kind) {
    case 'turn_wrong_way':
      return !!clearance.heading;
    case 'level_bust':
      return !!clearance.altitude && clearance.altitude.action !== 'maintain';
    case 'wrong_vertical':
      return !!clearance.altitude && clearance.altitude.action !== 'maintain';
    case 'ignore':
      return !!clearance.heading || !!clearance.altitude;
  }
}

/**
 * The targets the faulty aircraft flies instead. Returns null for 'ignore' (the aircraft
 * keeps doing what it was doing).
 */
export function faultyTargets(
  fault: ExecutionFault,
  clearance: Clearance,
  aircraft: Aircraft,
): Targets | null {
  const targets = targetsFor(clearance);
  switch (fault.kind) {
    case 'turn_wrong_way': {
      const cleared = clearance.heading!;
      const shortWay =
        (((cleared.valueDeg - aircraft.headingDeg) % 360) + 360) % 360 <= 180 ? 'right' : 'left';
      const intended = cleared.turn === 'any' ? shortWay : cleared.turn;
      targets.turnDir = intended === 'left' ? 'right' : 'left';
      return targets;
    }
    case 'level_bust': {
      const cleared = clearance.altitude!;
      const overshoot = fault.overshootFt ?? DEFAULT_OVERSHOOT_FT;
      const down = cleared.valueFt < aircraft.altitudeFt;
      targets.altitudeFt = Math.max(
        MIN_TARGET_ALTITUDE_FT,
        cleared.valueFt + (down ? -overshoot : overshoot),
      );
      return targets;
    }
    case 'wrong_vertical': {
      const down = clearance.altitude!.valueFt < aircraft.altitudeFt;
      targets.altitudeFt = Math.round(
        aircraft.altitudeFt + (down ? WRONG_VERTICAL_FT : -WRONG_VERTICAL_FT),
      );
      return targets;
    }
    case 'ignore':
      return null;
  }
}
