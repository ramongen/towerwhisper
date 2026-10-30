import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { AircraftDetails, AirspaceResponse } from '@towerwhisper/shared';
import { SimulationService } from '../simulation/simulation.service';
import { WeatherService } from '../weather/weather.service';
import { AIRCRAFT_TYPES, AIRPORT, RUNWAYS } from './constants';
import { assessRunways } from './runway-advisor';

@Controller()
export class AirportController {
  constructor(
    private readonly simulation: SimulationService,
    private readonly weather: WeatherService,
  ) {}

  /** GET /api/airspace — airport, runways and fixes for the scope. */
  @Get('airspace')
  airspace(): AirspaceResponse {
    return { airport: AIRPORT, runways: RUNWAYS, fixes: this.simulation.getFixes() };
  }

  /** GET /api/aircraft/:callsign — type data, flight plan and runway compatibility. */
  @Get('aircraft/:callsign')
  aircraft(@Param('callsign') callsign: string): AircraftDetails {
    const a = this.simulation.get(callsign);
    if (!a) throw new NotFoundException(`${callsign} is not on the scope`);
    const type = AIRCRAFT_TYPES[a.type] ?? null;
    const flightPlan = this.simulation.getFlightPlan(callsign) ?? null;
    const weather = this.weather.get();
    const weight = flightPlan?.declaredLandingWeightKg ?? type?.mlwKg;
    return {
      callsign: a.callsign,
      telephony: a.telephony,
      type,
      flightPlan,
      remainingRoute: this.simulation.getRemainingRoute(callsign),
      runways: type && weight ? assessRunways(type, weight, weather) : [],
      weatherBasis: weather ? 'live' : 'none',
    };
  }
}
