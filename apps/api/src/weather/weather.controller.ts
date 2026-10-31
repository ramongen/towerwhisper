import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import type { WeatherRadarResponse, WeatherResponse } from '@towerwhisper/shared';
import { RadarService } from './radar.service';
import { WeatherService } from './weather.service';

/** The two Express response methods we use (no @types/express dependency). */
interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: unknown): void;
  end(body?: unknown): void;
  setHeader(name: string, value: string): void;
}

@Controller('weather')
export class WeatherController {
  constructor(
    private readonly weather: WeatherService,
    private readonly radar: RadarService,
  ) {}

  /** GET /api/weather/radar — the latest precipitation radar frame. */
  @Get('radar')
  radarInfo(): WeatherRadarResponse {
    return this.radar.info();
  }

  /** GET /api/weather/radar/tiles/:z/:x/:y.png — one radar tile of our area. */
  @Get('radar/tiles/:z/:x/:y.png')
  async radarTile(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Res() res: JsonResponse,
  ): Promise<void> {
    const png = await this.radar.tile(z, x, y);
    if (!png) throw new NotFoundException();
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'public, max-age=300');
    res.status(HttpStatus.OK).end(png);
  }

  /** GET /api/weather — the latest observation, or 204 while none has arrived. */
  @Get()
  get(@Res() res: JsonResponse): void {
    const current: WeatherResponse | null = this.weather.get();
    if (current) res.status(HttpStatus.OK).json(current);
    else res.status(HttpStatus.NO_CONTENT).end();
  }
}
