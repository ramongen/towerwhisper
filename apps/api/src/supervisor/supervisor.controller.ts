import { Controller, Get, Param, Query } from '@nestjs/common';
import type {
  AnalyticsRange,
  ReplaySession,
  ReplaySessionSummary,
  SupervisorAnalytics,
  SupervisorOverviewPayload,
} from '@towerwhisper/shared';
import { Roles } from '../auth/decorators';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DEFAULT_SECTOR_ID } from '../sectors/sectors';
import { SupervisorService } from './supervisor.service';

@Roles('supervisor')
@Controller()
export class SupervisorController {
  constructor(
    private readonly supervisor: SupervisorService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** GET /api/supervisor/overview — the same live picture the socket pushes. */
  @Get('supervisor/overview')
  overview(): SupervisorOverviewPayload {
    return this.realtime.overview();
  }

  /** GET /api/supervisor/analytics?range=24h&sector=all */
  @Get('supervisor/analytics')
  analytics(
    @Query('range') range: AnalyticsRange = '24h',
    @Query('sector') sector?: string,
  ): Promise<SupervisorAnalytics> {
    return this.supervisor.analytics(range, sector && sector !== 'all' ? sector : null);
  }

  /** GET /api/replay/sessions?sector=craiova-app */
  @Get('replay/sessions')
  sessions(@Query('sector') sector = DEFAULT_SECTOR_ID): Promise<ReplaySessionSummary[]> {
    return this.supervisor.replaySessions(sector);
  }

  /** GET /api/replay/sessions/:id */
  @Get('replay/sessions/:id')
  replay(@Param('id') id: string): Promise<ReplaySession> {
    return this.supervisor.replay(id);
  }
}
