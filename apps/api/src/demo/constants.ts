import type { AlertType, FaultConfig } from '@towerwhisper/shared';

/** Default readback fault: pilot reads back 2000 ft off (e.g. 5000 instead of 3000). */
export const DEFAULT_ALTITUDE_OFFSET_FT = 2000;

/** Default execution fault: level bust overshoot (e.g. descends to 1500 instead of 3000). */
export const DEFAULT_OVERSHOOT_FT = 1500;

/** Wrong vertical: the aircraft climbs this much instead of descending (and vice versa). */
export const WRONG_VERTICAL_FT = 2000;

export const DEFAULT_RADIO_NOISE = 0.35;

/** "Spawn conflict": the intruder and the target reach the same point this long after the trigger. */
export const CONFLICT_MEET_S = 120;
/** The intruder comes from almost straight ahead, this many degrees off. */
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

// --- Demo history: past sessions recorded at startup for the supervisor dashboard ---------

/** Stored as the session's scenario, so the seeded sessions can be found and replaced. */
export const HISTORY_SCENARIO = 'demo-history';

/** Regenerate when the newest seeded session ended longer ago than this (charts stay current). */
export const HISTORY_STALE_AFTER_H = 6;

/**
 * Past sessions per sector, as [hours before now when it ended, minutes long]. At most 16
 * minutes: until then the generated arrivals keep their separation by themselves (later the
 * controller would have to sequence them, which the scripted one does not). The first
 * HISTORY_RADAR_SESSIONS also get their radar recorded (the replay's moving picture); older
 * ones replay transcripts and alerts only, which keeps the database small.
 */
export const HISTORY_SESSIONS: [endedHoursAgo: number, minutes: number][] = [
  [0.3, 15],
  [2, 14],
  [3.5, 16],
  [6, 13],
  [8, 15],
  [11, 14],
  [15, 16],
  [18, 12],
  [21, 15],
  [30, 14],
  [44, 16],
  [52, 13],
  [77, 15],
  [99, 14],
  [124, 16],
  [148, 13],
  [200, 15],
  [270, 14],
  [340, 13],
  [420, 15],
  [500, 14],
  [600, 13],
];
export const HISTORY_RADAR_SESSIONS = 2;

/** Each sector's sessions are shifted by up to this much, so they do not line up. */
export const HISTORY_SECTOR_JITTER_H = 1.5;

/** Incidents (armed faults or triggers) per session, inclusive. */
export const HISTORY_INCIDENTS = { min: 2, max: 5 };

/** Seconds between the controller's first call to each arrival, plus up to the jitter. */
export const HISTORY_CALL_SPACING_S = 140;
export const HISTORY_CALL_JITTER_S = 40;
export const HISTORY_FIRST_CALL_S = 40;

/** The controller answers a landing request after this many seconds (min, max). */
export const HISTORY_LANDING_REPLY_S = [4, 9] as const;
/** A vector off the route lasts this long before "proceed direct" (min, max). */
export const HISTORY_VECTOR_S = [50, 90] as const;

/**
 * How the controller handles an alert in the history: after `delayS` (min, max) it resolves
 * it with probability `resolve`, and repeats the instruction (min, max s later) when `repeat`.
 */
export const HISTORY_REACTIONS: Record<
  AlertType,
  { delayS: readonly [number, number]; resolve: number; repeat: boolean }
> = {
  HEARBACK_MISMATCH: { delayS: [4, 25], resolve: 0.55, repeat: true },
  READBACK_INCOMPLETE: { delayS: [5, 30], resolve: 0.5, repeat: true },
  NO_RESPONSE: { delayS: [3, 15], resolve: 0.3, repeat: true },
  WRONG_TURN: { delayS: [5, 35], resolve: 0.85, repeat: true },
  WRONG_VERTICAL: { delayS: [5, 35], resolve: 0.85, repeat: true },
  LEVEL_BUST: { delayS: [3, 20], resolve: 0.9, repeat: true },
  NO_CONTACT: { delayS: [20, 150], resolve: 0.5, repeat: true },
  CONFLICT_PREDICTED: { delayS: [8, 45], resolve: 0.6, repeat: false },
};

/** One controller per generated sector, created with the history (password DEFAULT_PASSWORD). */
export const HISTORY_CONTROLLERS: Record<string, { email: string; name: string }> = {
  'bucuresti-app': { email: 'atc.bucuresti@towerwhisper.app', name: 'Elena Dumitrescu' },
  'timisoara-app': { email: 'atc.timisoara@towerwhisper.app', name: 'Mihai Stan' },
  'cluj-app': { email: 'atc.cluj@towerwhisper.app', name: 'Ioana Rusu' },
  'oradea-app': { email: 'atc.oradea@towerwhisper.app', name: 'Radu Marin' },
};

/** Radar frames are written in batches of this many rows. */
export const HISTORY_FRAME_BATCH = 300;

/** A headless session hands the event loop back to the live sectors every this many ticks. */
export const HISTORY_YIELD_TICKS = 200;
