import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  SECTOR_HEADER,
  type DemoSessionInfo,
  type DemoTriggerResponse,
  type FaultConfig,
} from '@towerwhisper/shared';
import type { AuthUser } from '../auth/auth.service';
import { CurrentUser, Public } from '../auth/decorators';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SectorRegistry } from '../sectors/sector-registry';

/**
 * Hidden demo panel API: fault configuration and scenario triggers of one sector's session
 * (X-Sector-Id). No login, so it opens instantly on a phone in front of the jury.
 */
@Public()
@Controller('demo')
export class DemoController {
  constructor(
    private readonly sectors: SectorRegistry,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Every sector's live session and who is in it, so the panel can pick the one to drive. */
  @Get('sessions')
  sessions(): DemoSessionInfo[] {
    return this.sectors.all().map((runtime) => {
      const { controllers, viewers } = this.realtime.presence(runtime.id);
      return {
        sector: runtime.sector.info,
        sessionId: runtime.session.id,
        startedAt: runtime.session.startedAt,
        users: [...controllers, ...viewers],
        aircraftCount: runtime.simulation.getAircraft().length,
        activeAlerts: runtime.alerts.list().length,
      };
    });
  }

  @Get('faults')
  getFaults(
    @CurrentUser() user: AuthUser | undefined,
    @Headers(SECTOR_HEADER) sector: string | undefined,
  ): FaultConfig {
    return this.sectors.forRequest(user, sector).faults.getConfig();
  }

  @Put('faults')
  putFaults(
    @Body() config: FaultConfig,
    @CurrentUser() user: AuthUser | undefined,
    @Headers(SECTOR_HEADER) sector: string | undefined,
  ): FaultConfig {
    const runtime = this.sectors.forRequest(user, sector);
    const next = runtime.faults.setConfig(config);
    return next;
  }

  @Post('triggers/:name')
  @HttpCode(200)
  trigger(
    @Param('name') name: string,
    @Body() body: Record<string, unknown> = {},
    @CurrentUser() user: AuthUser | undefined,
    @Headers(SECTOR_HEADER) sector: string | undefined,
  ): DemoTriggerResponse {
    return this.sectors.forRequest(user, sector).faults.trigger(name, body ?? {});
  }
}
