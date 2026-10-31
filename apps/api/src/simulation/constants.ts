/** Simulation tick; traffic:update is broadcast once per tick (4 Hz). */
export const TICK_MS = 250;

/** Standard rate turn. */
export const TURN_RATE_DEG_S = 3;

/** Climb / descent rate range (each aircraft gets a fixed rate in this range). */
export const VERTICAL_RATE_MIN_FPM = 1500;
export const VERTICAL_RATE_MAX_FPM = 2000;
/** Levelling off: vertical speed shrinks to this many fpm per ft left to go... */
export const LEVEL_OFF_FPM_PER_FT = 3;
/** ...but never below this, so the aircraft actually arrives. */
export const LEVEL_OFF_MIN_FPM = 300;

export const SPEED_CHANGE_KT_S = 2;

/** ILS: localizer capture when this close to the centreline (NM)... */
export const LOC_CAPTURE_NM = 1.5;
/** ...steering gain (degrees of correction per NM off the centreline), capped. */
export const LOC_GAIN_DEG_PER_NM = 25;
export const LOC_MAX_CORRECTION_DEG = 30;
/** 3° glide slope. */
export const GLIDE_SLOPE_FT_PER_NM = 318;
/** Aircraft closer than this to the threshold have landed and leave the scope. */
export const LANDED_NM = 0.6;

/** Own navigation: a fix counts as passed within this distance (turn anticipation). */
export const WAYPOINT_REACHED_NM = 1.5;

/** Landing: the pilot asks for landing clearance this far from the threshold (NM)... */
export const LANDING_REQUEST_NM = 8;
/** ...and goes around this close to it if the clearance has not come. */
export const GO_AROUND_NM = 1.5;
/** Go-around: runway heading, climb to this altitude, this speed; then vectors. */
export const GO_AROUND_ALTITUDE_FT = 4000;
export const GO_AROUND_SPEED_KT = 220;
/** Speed on the localizer: 210 kt beyond 12 NM, 170 kt beyond 6 NM, then the type's Vapp. */
export const APPROACH_SPEEDS: { beyondNm: number; speedKt: number }[] = [
  { beyondNm: 12, speedKt: 210 },
  { beyondNm: 6, speedKt: 170 },
];
export const DEFAULT_APPROACH_SPEED_KT = 140;
/** Cleared to land and roughly lined up: capture the final approach straight away. */
export const ALIGNED_CROSS_TRACK_NM = 4;
export const ALIGNED_HEADING_DEG = 45;
export const ALIGNED_MIN_NM = 2;
export const ALIGNED_MAX_NM = 25;
