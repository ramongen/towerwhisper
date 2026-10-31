import { Controller, Get, Headers, Param } from '@nestjs/common';
import {
  SECTOR_HEADER,
  type AircraftDetails,
  type AirspaceResponse,
  type SectorInfo,
} from '@towerwhisper/shared';
import type { AuthUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators';
import { SectorRegistry } from '../sectors/sector-registry';
import { SECTORS } from '../sectors/sectors';

@Controller()
export class AirportController {
  constructor(private readonly sectors: SectorRegistry) {}

  /** GET /api/sectors — every approach sector that can be worked. */
  @Get('sectors')
  list(): SectorInfo[] {
    return SECTORS.map((s) => s.info);
  }

  /** GET /api/airspace — airport, runways and fixes of the sector, for the scope. */
  @Get('airspace')
  airspace(
    @CurrentUser() user: AuthUser,
    @Headers(SECTOR_HEADER) sector: string | undefined,
  ): AirspaceResponse {
    return this.sectors.forRequest(user, sector).sector.airspace.toResponse();
  }

  /** GET /api/aircraft/:callsign — type data, flight plan and runway compatibility. */
  @Get('aircraft/:callsign')
  aircraft(
    @Param('callsign') callsign: string,
    @CurrentUser() user: AuthUser,
    @Headers(SECTOR_HEADER) sector: string | undefined,
  ): AircraftDetails {
    return this.sectors.forRequest(user, sector).aircraftDetails(callsign);
  }
}
