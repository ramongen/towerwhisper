import { Module } from '@nestjs/common';
import { SimulationModule } from '../simulation/simulation.module';
import { WeatherModule } from '../weather/weather.module';
import { AirportController } from './airport.controller';

/** Static airport data, aircraft type data and runway advice (advisory, not a safety check). */
@Module({
  imports: [SimulationModule, WeatherModule],
  controllers: [AirportController],
})
export class AirportModule {}
