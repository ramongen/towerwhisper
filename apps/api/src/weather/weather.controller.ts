import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { WeatherResponse } from '@towerwhisper/shared';
import { WeatherService } from './weather.service';

/** The two Express response methods we use (no @types/express dependency). */
interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: unknown): void;
  end(): void;
}

@Controller('weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  /** GET /api/weather — the latest observation, or 204 while none has arrived. */
  @Get()
  get(@Res() res: JsonResponse): void {
    const current: WeatherResponse | null = this.weather.get();
    if (current) res.status(HttpStatus.OK).json(current);
    else res.status(HttpStatus.NO_CONTENT).end();
  }
}
