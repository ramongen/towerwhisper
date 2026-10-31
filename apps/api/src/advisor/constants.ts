/** No advice to an aircraft for this long after the controller called it (sim ms): it is busy. */
export const ADVISORY_QUIET_MS = 10_000;

/** Landing clearance: advised on final from this far out (NM)... */
export const LANDING_ADVICE_NM = 10;
/** ...when lined up: this close to the centreline (NM) and this close to the course (deg). */
export const ON_FINAL_CROSS_TRACK_NM = 1.5;
export const ON_FINAL_HEADING_DEG = 45;
/** Urgent when the go-around would come in less than this (s). */
export const LANDING_URGENT_S = 90;

/** Approach clearance: advised this far (NM along the route) before the intermediate fix. */
export const APPROACH_ADVICE_NM = 20;

/** Direct-to: each degree of turn costs as much as this many NM / 180 deg of extra track. */
export const TURN_PENALTY_NM = 6;
/** Arriving at the IF more than this off the final course (deg) is a poor intercept... */
export const POOR_INTERCEPT_DEG = 120;
/** ...and costs this much (NM). */
export const POOR_INTERCEPT_PENALTY_NM = 10;

/**
 * Circuit back to the ILS (after a go-around, or vectored near the airport), in NM from the
 * final course and from the IF: crosswind until downwindNm abeam, downwind until pastIfNm past
 * the IF, then base, and the 30 degree intercept once within abeamNm of the centreline
 * (between insideIfNm inside the IF and maxFinalNm out). The circuit is used within areaNm of
 * the final course, up to baseNm past the IF; farther out, a direct-to. centrelineNm/2 decides
 * the circuit side (right-hand when on the centreline).
 */
export const CIRCUIT = {
  abeamNm: 3.5,
  centrelineNm: 2.5,
  downwindNm: 4,
  pastIfNm: 1,
  baseNm: 5,
  insideIfNm: 2,
  maxFinalNm: 25,
  areaNm: 8,
};
/** Intercept angle onto the localizer (deg). */
export const INTERCEPT_DEG = 30;
/** No vector advice while the aircraft already flies within this of it (deg). */
export const HEADING_TOLERANCE_DEG = 20;
