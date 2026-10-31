import { Logger } from '@nestjs/common';
import type { AirportWeather, FlightCategory, RunwayId, RunwayWind } from '@towerwhisper/shared';
import { CRAIOVA, type Airspace } from '../airspace/airspace';
import {
  CATEGORY_LIMITS,
  METAR_URL,
  METRES_PER_STATUTE_MILE,
  OPEN_METEO_URL,
  UNLIMITED_VISIBILITY_M,
  WEATHER_REFRESH_MS,
  WEATHER_TIMEOUT_MS,
} from './constants';

/** The fields of aviationweather.gov's METAR JSON that we use. */
interface MetarJson {
  rawOb?: string;
  obsTime?: number;
  wdir?: number | string;
  wspd?: number;
  wgst?: number | null;
  visib?: number | string;
  altim?: number;
  temp?: number;
  dewp?: number;
  wxString?: string | null;
  clouds?: { cover: string; base: number | null }[];
  fltCat?: string;
}

interface OpenMeteoJson {
  current?: {
    time: string;
    temperature_2m: number;
    dew_point_2m: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    pressure_msl: number;
    visibility: number;
    precipitation: number;
  };
}

/**
 * Live weather at the sector's airport. Fetched in the background and cached, so a slow or
 * failing weather API never delays anything else; the last good observation stays on screen.
 */
export class WeatherService {
  private readonly logger: Logger;
  private current: AirportWeather | null = null;
  private timer?: NodeJS.Timeout;
  private readonly listeners: ((weather: AirportWeather) => void)[] = [];

  constructor(private readonly airspace: Airspace) {
    this.logger = new Logger(`Weather ${airspace.airport.icao}`);
  }

  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), WEATHER_REFRESH_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  get(): AirportWeather | null {
    return this.current;
  }

  onUpdate(listener: (weather: AirportWeather) => void): void {
    this.listeners.push(listener);
  }

  async refresh(): Promise<void> {
    const weather = (await this.fromMetar()) ?? (await this.fromModel());
    if (!weather) return;
    const changed =
      weather.raw !== this.current?.raw || weather.observedAt !== this.current?.observedAt;
    this.current = weather;
    if (changed) {
      this.logger.log(`Weather ${weather.source}: ${weather.raw ?? 'model data'}`);
      for (const l of this.listeners) l(weather);
    }
  }

  private async fromMetar(): Promise<AirportWeather | null> {
    try {
      const response = await fetch(`${METAR_URL}?ids=${this.airspace.airport.icao}&format=json`, {
        signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const [m] = (await response.json()) as MetarJson[];
      if (!m?.rawOb) throw new Error('no METAR in the answer');
      return decodeMetar(m, this.airspace);
    } catch (error) {
      this.logger.warn(`METAR unavailable: ${(error as Error).message}`);
      return null;
    }
  }

  private async fromModel(): Promise<AirportWeather | null> {
    try {
      const params = new URLSearchParams({
        latitude: String(this.airspace.airport.lat),
        longitude: String(this.airspace.airport.lon),
        current:
          'temperature_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,visibility,precipitation',
        wind_speed_unit: 'kn',
        timezone: 'UTC',
      });
      const response = await fetch(`${OPEN_METEO_URL}?${params}`, {
        signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const c = ((await response.json()) as OpenMeteoJson).current;
      if (!c) throw new Error('no current data');
      const windDirDeg = Math.round(c.wind_direction_10m);
      const windSpeedKt = Math.round(c.wind_speed_10m);
      const gust = Math.round(c.wind_gusts_10m);
      const visibilityM = Math.min(UNLIMITED_VISIBILITY_M, Math.round(c.visibility));
      return finish(this.airspace, {
        icao: this.airspace.airport.icao,
        source: 'model',
        observedAt: new Date(`${c.time}Z`).toISOString(),
        raw: null,
        windDirDeg,
        windSpeedKt,
        windGustKt: gust >= windSpeedKt + 10 ? gust : null,
        visibilityM,
        clouds: [],
        ceilingFt: null,
        temperatureC: Math.round(c.temperature_2m),
        dewpointC: Math.round(c.dew_point_2m),
        qnhHpa: Math.round(c.pressure_msl),
        weather: c.precipitation > 0 ? 'RA' : null,
        flightCategory: category(null, visibilityM),
      });
    } catch (error) {
      this.logger.warn(`Model weather unavailable: ${(error as Error).message}`);
      return null;
    }
  }
}

export function decodeMetar(m: MetarJson, airspace: Airspace = CRAIOVA): AirportWeather {
  const clouds = (m.clouds ?? [])
    .filter((c) => c.base !== null && c.base !== undefined)
    .map((c) => ({ cover: c.cover, baseFt: c.base as number }));
  const ceiling = clouds.find((c) => c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'OVX');
  const visibilityM =
    m.visib === undefined
      ? null
      : typeof m.visib === 'string'
        ? UNLIMITED_VISIBILITY_M // '10+'
        : Math.min(
            UNLIMITED_VISIBILITY_M,
            Math.round((m.visib * METRES_PER_STATUTE_MILE) / 50) * 50,
          );
  const ceilingFt = ceiling?.baseFt ?? null;
  const reported = m.fltCat as FlightCategory | undefined;

  return finish(airspace, {
    icao: airspace.airport.icao,
    source: 'metar',
    observedAt: m.obsTime ? new Date(m.obsTime * 1000).toISOString() : new Date().toISOString(),
    raw: m.rawOb ?? null,
    windDirDeg: typeof m.wdir === 'number' ? m.wdir : null,
    windSpeedKt: m.wspd ?? 0,
    windGustKt: m.wgst ?? null,
    visibilityM,
    clouds,
    ceilingFt,
    temperatureC: m.temp ?? null,
    dewpointC: m.dewp ?? null,
    qnhHpa: m.altim !== undefined ? Math.round(m.altim) : null,
    weather: m.wxString || null,
    flightCategory:
      reported && ['VFR', 'MVFR', 'IFR', 'LIFR'].includes(reported)
        ? reported
        : category(ceilingFt, visibilityM),
  });
}

/** Adds what is derived from the observation: runway wind components, preferred runway, wet runway. */
function finish(
  airspace: Airspace,
  w: Omit<AirportWeather, 'runwayWind' | 'preferredRunway' | 'wetRunway' | 'fetchedAt'>,
): AirportWeather {
  const runwayWind = airspace.runways.map(({ id }) =>
    componentsFor(id, w.windDirDeg, w.windSpeedKt, airspace),
  );
  const best = [...runwayWind].sort((a, b) => b.headwindKt - a.headwindKt)[0];
  return {
    ...w,
    runwayWind,
    preferredRunway: best && best.headwindKt > 0 ? best.runway : airspace.ilsRunway,
    wetRunway: /RA|DZ|SN|SG|PL|GR|GS|UP|SH|TS/.test(w.weather ?? ''),
    fetchedAt: new Date().toISOString(),
  };
}

/** Headwind / crosswind for one runway; a variable wind counts as a full tailwind and crosswind. */
export function componentsFor(
  id: RunwayId,
  windDirDeg: number | null,
  speedKt: number,
  airspace: Airspace = CRAIOVA,
): RunwayWind {
  if (windDirDeg === null) return { runway: id, headwindKt: -speedKt, crosswindKt: speedKt };
  // METAR wind is true north; so is the runway bearing from the AIP.
  const angle = ((windDirDeg - airspace.runway(id).trueBearingDeg) * Math.PI) / 180;
  return {
    runway: id,
    headwindKt: Math.round(speedKt * Math.cos(angle)),
    crosswindKt: Math.abs(Math.round(speedKt * Math.sin(angle))),
  };
}

function category(ceilingFt: number | null, visibilityM: number | null): FlightCategory | null {
  if (visibilityM === null && ceilingFt === null) return null;
  for (const cat of ['LIFR', 'IFR', 'MVFR'] as const) {
    const limit = CATEGORY_LIMITS[cat];
    if (
      (ceilingFt !== null && ceilingFt < limit.ceilingFt) ||
      (visibilityM !== null && visibilityM < limit.visibilityM)
    ) {
      return cat;
    }
  }
  return 'VFR';
}
