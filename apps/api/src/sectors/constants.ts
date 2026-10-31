export const METRES_PER_NM = 1852;

/** Published points kept for a sector's scope: within this distance of its airport. */
export const FIX_RADIUS_NM = 70;

/**
 * Simulated approach points for airports without AIP approach data: the intermediate fix on
 * the extended centreline, and base points this far out and this far to each side.
 */
export const APPROACH_POINTS = { intermediateNm: 10, baseNm: 16, baseOffsetNm: 7 };
export const SIMULATED_POINT_NOTE = 'approach points CF/LB/RB simulated';

/** Generated arrivals per sector (Craiova uses its hand-made scenario). */
export const GENERATED_ARRIVALS = 6;
/** The first arrival is this far (track miles) from the threshold; each next one further. */
export const FIRST_ARRIVAL_NM = 38;
/** About 4 minutes between arrivals at approach speeds. */
export const ARRIVAL_SPACING_NM = 15;
/** Entry fixes (STAR points) are taken between these distances from the airport. */
export const ENTRY_MIN_NM = 15;
export const ENTRY_MAX_NM = 70;
/** Altitude limits of the generated arrivals. */
export const ARRIVAL_MIN_FT = 6000;
/** One level per arrival, this far apart (the first is the lowest). */
export const ARRIVAL_LEVEL_STEP_FT = 1000;
export const ARRIVAL_MAX_FT = 15000;

/** Romanian approach sectors: altitudes in feet up to here, flight levels above. */
export const TRANSITION_ALTITUDE_FT = 5000;

/** Recent transmissions and readbacks replayed to a screen that joins a sector late. */
export const COMMS_HISTORY_SIZE = 40;

/** Replay: a radar picture every 2 s, written to the database in batches every 10 s. */
export const FRAME_INTERVAL_MS = 2000;
export const FRAME_FLUSH_MS = 10_000;

/** Supervisor dashboard refresh, on top of the pushes when alerts change. */
export const OVERVIEW_INTERVAL_MS = 3000;
/** Several alert changes within this window are pushed once. */
export const OVERVIEW_DEBOUNCE_MS = 300;
