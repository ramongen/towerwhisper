/** Live METAR (no key): aviationweather.gov data API. */
export const METAR_URL = 'https://aviationweather.gov/api/data/metar';
/** Fallback when there is no METAR: Open-Meteo model data (no key). */
export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** METARs are issued every 30 min; checking every 5 min shows a new one quickly. */
export const WEATHER_REFRESH_MS = 5 * 60 * 1000;
export const WEATHER_TIMEOUT_MS = 6000;

/** Flight category limits (ceiling ft, visibility m), FAA convention as used by aviationweather.gov. */
export const CATEGORY_LIMITS = {
  LIFR: { ceilingFt: 500, visibilityM: 1600 },
  IFR: { ceilingFt: 1000, visibilityM: 4800 },
  MVFR: { ceilingFt: 3000, visibilityM: 8000 },
};

export const METRES_PER_STATUTE_MILE = 1609.34;
/** Visibility '10+' statute miles: reported as 10 km or more. */
export const UNLIMITED_VISIBILITY_M = 9999;

/** Precipitation radar: RainViewer public composite (no key), zoom 7 is the finest it serves. */
export const RADAR_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';
export const RADAR_ZOOM = 7;
/** NEXRAD-like palette: green, yellow, red, magenta, as on an airborne weather radar. */
export const RADAR_COLOR_SCHEME = 6;
/** Area served around the airport (degrees), the same as the terrain map. */
export const RADAR_AREA_DEG = { lat: 1.6, lon: 4.8 };
/** New frames every 10 min; check every 5. */
export const RADAR_REFRESH_MS = 5 * 60 * 1000;
export const RADAR_TILE_TTL_MS = 10 * 60 * 1000;
