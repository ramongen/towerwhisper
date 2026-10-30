/** Live METAR (no key): aviationweather.gov data API. */
export const METAR_URL = 'https://aviationweather.gov/api/data/metar';
/** Fallback when there is no METAR: Open-Meteo model data (no key). */
export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** METARs are issued every 30 min; checking every 5 min shows a new one quickly. */
export const WEATHER_REFRESH_MS = 5 * 60 * 1000;
export const WEATHER_TIMEOUT_MS = 6000;

/** Runway directions of LRCV (magnetic headings rounded to the runway numbers). */
export const RUNWAY_HEADINGS = { '09': 90, '27': 270 } as const;

/** Flight category limits (ceiling ft, visibility m), FAA convention as used by aviationweather.gov. */
export const CATEGORY_LIMITS = {
  LIFR: { ceilingFt: 500, visibilityM: 1600 },
  IFR: { ceilingFt: 1000, visibilityM: 4800 },
  MVFR: { ceilingFt: 3000, visibilityM: 8000 },
};

export const METRES_PER_STATUTE_MILE = 1609.34;
/** Visibility '10+' statute miles: reported as 10 km or more. */
export const UNLIMITED_VISIBILITY_M = 9999;
