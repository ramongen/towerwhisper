import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { WeatherRadarResponse } from '@towerwhisper/shared';
import { SECTORS } from '../sectors/sectors';
import {
  RADAR_AREA_DEG,
  RADAR_COLOR_SCHEME,
  RADAR_MAPS_URL,
  RADAR_REFRESH_MS,
  RADAR_TILE_TTL_MS,
  RADAR_ZOOM,
  WEATHER_TIMEOUT_MS,
} from './constants';

interface MapsJson {
  host?: string;
  radar?: { past?: { time: number; path: string }[] };
}

/** Web Mercator tile index of a longitude / latitude. */
const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/**
 * Live precipitation radar (RainViewer public composite, no key) for the "WX radar" map mode.
 * The API serves the tiles around our sectors' airports only, cached, so the browser never calls a third party
 * and a slow radar service never slows the scope. Advisory only.
 */
@Injectable()
export class RadarService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadarService.name);
  private frame: { host: string; path: string; time: number } | null = null;
  private readonly tiles = new Map<string, { png: Buffer; at: number }>();
  private timer?: NodeJS.Timeout;

  readonly area = (() => {
    const lats = SECTORS.map((s) => s.airspace.airport.lat);
    const lons = SECTORS.map((s) => s.airspace.airport.lon);
    return {
      xMin: tileX(Math.min(...lons) - RADAR_AREA_DEG.lon, RADAR_ZOOM),
      xMax: tileX(Math.max(...lons) + RADAR_AREA_DEG.lon, RADAR_ZOOM),
      yMin: tileY(Math.max(...lats) + RADAR_AREA_DEG.lat, RADAR_ZOOM),
      yMax: tileY(Math.min(...lats) - RADAR_AREA_DEG.lat, RADAR_ZOOM),
    };
  })();

  onModuleInit(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), RADAR_REFRESH_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  info(): WeatherRadarResponse {
    return {
      available: this.frame !== null,
      time: this.frame ? new Date(this.frame.time * 1000).toISOString() : null,
      zoom: RADAR_ZOOM,
      tileUrl: `/api/weather/radar/tiles/${RADAR_ZOOM}/{x}/{y}.png`,
      ...this.area,
    };
  }

  /** One tile of the latest frame, or null (outside our area, no frame, upstream failure). */
  async tile(z: number, x: number, y: number): Promise<Buffer | null> {
    const { xMin, xMax, yMin, yMax } = this.area;
    if (!this.frame || z !== RADAR_ZOOM || x < xMin || x > xMax || y < yMin || y > yMax)
      return null;
    const key = `${this.frame.path}/${x}/${y}`;
    const cached = this.tiles.get(key);
    if (cached && Date.now() - cached.at < RADAR_TILE_TTL_MS) return cached.png;
    try {
      const url = `${this.frame.host}${this.frame.path}/256/${z}/${x}/${y}/${RADAR_COLOR_SCHEME}/0_1.png`;
      const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const png = Buffer.from(await response.arrayBuffer());
      this.tiles.set(key, { png, at: Date.now() });
      return png;
    } catch (error) {
      this.logger.warn(`Radar tile ${x}/${y} unavailable: ${(error as Error).message}`);
      return cached?.png ?? null;
    }
  }

  private async refresh(): Promise<void> {
    try {
      const response = await fetch(RADAR_MAPS_URL, {
        signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as MapsJson;
      const latest = body.radar?.past?.at(-1);
      if (!body.host || !latest) throw new Error('no radar frame');
      if (latest.path !== this.frame?.path) this.tiles.clear();
      this.frame = { host: body.host, path: latest.path, time: latest.time };
    } catch (error) {
      this.logger.warn(`Weather radar unavailable: ${(error as Error).message}`);
    }
  }
}
