import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import type {
  Alert,
  AlertOutcomeFilter,
  AlertSearchResponse,
  AlertType,
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

  /** GET /api/supervisor/alerts — every alert ever raised, filtered, newest first. */
  @Get('supervisor/alerts')
  alerts(
    @Query('sector') sector?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('outcome') outcome?: string,
    @Query('since') since?: string,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ): Promise<AlertSearchResponse> {
    const sinceDate = since ? new Date(since) : undefined;
    if (sinceDate && Number.isNaN(sinceDate.getTime())) throw new BadRequestException('Bad since');
    if (severity && !['caution', 'warning'].includes(severity)) {
      throw new BadRequestException('Bad severity');
    }
    if (outcome && !['resolved', 'cleared', 'open'].includes(outcome)) {
      throw new BadRequestException('Bad outcome');
    }
    return this.supervisor.searchAlerts({
      sector: sector && sector !== 'all' ? sector : undefined,
      type: (type || undefined) as AlertType | undefined,
      severity: (severity || undefined) as Alert['severity'] | undefined,
      outcome: (outcome || undefined) as AlertOutcomeFilter | undefined,
      since: sinceDate,
      q,
      page: Number(page),
      pageSize: Number(pageSize),
    });
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
