import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { RadarService } from './radar.service';
import { WeatherService } from './weather.service';

/** Live airport weather (METAR, model fallback). Advisory only: no safety check reads it. */
@Module({
  controllers: [WeatherController],
  providers: [WeatherService, RadarService],
  exports: [WeatherService],
})
export class WeatherModule {}
