export const DEFAULT_SCENARIO = 'craiova-arrivals';

/** Craiova airport (LRCV), runway 09/27 — the centre of the radar scope. */
export const LRCV = {
  icao: 'LRCV',
  lat: 44.3181,
  lon: 23.8886,
  runways: ['09', '27'] as const,
};
