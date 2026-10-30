// Thresholds for the deterministic safety checks. Never call an LLM or network service from src/safety/.

/** Readback Check: NO_RESPONSE when no readback arrives within this time. */
export const NO_RESPONSE_AFTER_S = 8;

/** Conformance alerts are raised only after a deviation persists this long (simulation time). */
export const CONFORMANCE_PERSISTENCE_S = 4;

/** An aircraft that has not started the manoeuvre this long after the readback is not conforming. */
export const EXECUTION_GRACE_S = 10;

/** WRONG_TURN: turn rate opposite to the cleared direction beyond this. */
export const WRONG_TURN_RATE_DEG_S = 0.5;

/** Heading counts as reached within this many degrees. */
export const HEADING_REACHED_DEG = 3;

/** WRONG_VERTICAL: vertical speed opposite to the target beyond this. */
export const WRONG_VERTICAL_FPM = 300;

/** LEVEL_BUST: within this distance of the target level... */
export const LEVEL_BUST_WINDOW_FT = 300;
/** ...with vertical speed still above this. */
export const LEVEL_BUST_MAX_VS_FPM = 1000;

/** Level counts as reached within this many feet. */
export const LEVEL_REACHED_FT = 100;

/** NO_CONTACT defaults in minutes (overridden by COMMS_CAUTION_MIN / COMMS_WARNING_MIN). */
export const DEFAULT_COMMS_CAUTION_MIN = 15;
export const DEFAULT_COMMS_WARNING_MIN = 30;

/** NO_CONTACT limits used by the demo-panel "15 / 30 s" toggle. */
export const DEMO_COMMS_CAUTION_S = 15;
export const DEMO_COMMS_WARNING_S = 30;

/** CONFLICT_PREDICTED: closest approach within this horizon... */
export const CONFLICT_LOOKAHEAD_S = 300;
/** ...under this horizontal distance... */
export const CONFLICT_HORIZONTAL_NM = 3;
/** ...and under this vertical distance. */
export const CONFLICT_VERTICAL_FT = 1000;
/** Clearance Probe trajectory step. */
export const PROBE_STEP_S = 5;
/** How often (simulation time) the probe re-checks current traffic. */
export const PROBE_INTERVAL_S = 2;

/** An alert whose message changes (seconds to bust, comms age) is re-sent at most this often. */
export const ALERT_UPDATE_MIN_INTERVAL_MS = 1000;
