/** Delay between the controller's transmission and the pilot readback. */
export const PILOT_RESPONSE_DELAY_MS = 1500;

/** Delay between the readback and the aircraft starting the manoeuvre. */
export const EXECUTION_DELAY_MIN_MS = 2000;
export const EXECUTION_DELAY_MAX_MS = 3000;

/** A level bust never sends an aircraft below this. */
export const MIN_TARGET_ALTITUDE_FT = 500;

/** Shown in the readback transcript when the transmission was stepped on. */
export const STEPPED_ON_MARK = '…';
