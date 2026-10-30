import type { AlertType, FaultConfig } from '@towerwhisper/shared';

/** Default readback fault: pilot reads back 2000 ft off (e.g. 5000 instead of 3000). */
export const DEFAULT_ALTITUDE_OFFSET_FT = 2000;

/** Default execution fault: level bust overshoot (e.g. descends to 1500 instead of 3000). */
export const DEFAULT_OVERSHOOT_FT = 1500;

/** Wrong vertical: the aircraft climbs this much instead of descending (and vice versa). */
export const WRONG_VERTICAL_FT = 2000;

export const DEFAULT_RADIO_NOISE = 0.35;

/** "Spawn conflict": the intruder starts this far ahead of the target, flying towards it. */
export const CONFLICT_SPAWN_DISTANCE_NM = 14;
export const CONFLICT_SPAWN_OFFSET_DEG = 15;
export const CONFLICT_INTRUDER = {
  callsign: 'BMS12',
  telephony: 'BLUE AIR 12',
  type: 'B737',
  speedKt: 260,
};

/** An injected fault counts as detected when its alert appears within this window. */
export const DETECTION_WINDOW_S = 90;

type FaultKind =
  | NonNullable<FaultConfig['readback']>['kind']
  | NonNullable<FaultConfig['execution']>['kind']
  | 'stepped_on'
  | 'conflict'
  | 'age_comms';

/** Which alert proves that each fault was caught (for the end-of-demo statistics). */
export const EXPECTED_ALERTS: Record<FaultKind, AlertType[]> = {
  wrong_altitude: ['HEARBACK_MISMATCH'],
  wrong_heading: ['HEARBACK_MISMATCH'],
  wrong_turn: ['HEARBACK_MISMATCH'],
  wrong_runway: ['HEARBACK_MISMATCH'],
  wrong_callsign: ['HEARBACK_MISMATCH'],
  incomplete: ['READBACK_INCOMPLETE'],
  no_response: ['NO_RESPONSE'],
  turn_wrong_way: ['WRONG_TURN'],
  level_bust: ['LEVEL_BUST'],
  wrong_vertical: ['WRONG_VERTICAL'],
  ignore: ['WRONG_TURN', 'WRONG_VERTICAL'],
  stepped_on: ['READBACK_INCOMPLETE', 'HEARBACK_MISMATCH'],
  conflict: ['CONFLICT_PREDICTED'],
  age_comms: ['NO_CONTACT'],
};

export type { FaultKind };
