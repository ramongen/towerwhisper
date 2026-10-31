import { Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import {
  SECTOR_HEADER,
  type CreateSessionResponse,
  type CurrentSessionResponse,
  type ResetSessionResponse,
  type ResolveAlertResponse,
  type SessionStats,
} from '@towerwhisper/shared';
import type { AuthUser } from '../auth/auth.service';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { SectorRegistry } from '../sectors/sector-registry';

/**
 * The live session of a sector (the caller's, or the one in X-Sector-Id). Public: the demo
 * panel on the phone reads and resets it without logging in.
 */
@Public()
@Controller('sessions')
export class SessionController {
  constructor(private readonly sectors: SectorRegistry) {}

  /** POST /sessions — restarts the sector's scenario from zero. */
  @Post()
  async create(
    @CurrentUser() user: AuthUser | undefined,
    @Headers(SECTOR_HEADER) sector: string | undefined,
  ): Promise<CreateSessionResponse> {
    return { sessionId: await this.sectors.forRequest(user, sector).reset() };
  }

  @Get('current')
  current(
    @CurrentUser() user: AuthUser | undefined,
    @Headers(SECTOR_HEADER) sector: string | undefined,
  ): CurrentSessionResponse {
    return this.sectors.forRequest(user, sector).current();
  }

  @Post(':id/reset')
  @HttpCode(200)
  async reset(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
    @Headers(SECTOR_HEADER) sector: string | undefined,
  ): Promise<ResetSessionResponse> {
    return { sessionId: await this.sectors.forRequest(user, sector).reset(id) };
  }

  @Get(':id/stats')
  stats(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
    @Headers(SECTOR_HEADER) sector: string | undefined,
  ): SessionStats {
    return this.sectors.forRequest(user, sector).stats(id);
  }
}

@Controller('alerts')
export class AlertsController {
  constructor(private readonly sectors: SectorRegistry) {}

  /** Only the sector's controller resolves its alerts; a supervisor watches. */
  @Post(':id/resolve')
  @Roles('atc')
  @HttpCode(200)
  resolve(@Param('id') id: string, @CurrentUser() user: AuthUser): ResolveAlertResponse {
    return this.sectors.forRequest(user, undefined).resolveAlert(id, user.id);
  }
}
