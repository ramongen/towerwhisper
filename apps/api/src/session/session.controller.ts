import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  CurrentSessionResponse,
  ResetSessionResponse,
  ResolveAlertResponse,
  SessionStats,
} from '@towerwhisper/shared';
import { DEFAULT_SCENARIO } from './constants';
import { SessionService } from './session.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Post()
  async create(@Body() body: Partial<CreateSessionRequest>): Promise<CreateSessionResponse> {
    return { sessionId: await this.sessions.create(body?.scenario ?? DEFAULT_SCENARIO) };
  }

  @Get('current')
  current(): CurrentSessionResponse {
    return this.sessions.current();
  }

  @Post(':id/reset')
  @HttpCode(200)
  async reset(@Param('id') id: string): Promise<ResetSessionResponse> {
    return { sessionId: await this.sessions.reset(id) };
  }

  @Get(':id/stats')
  stats(@Param('id') id: string): SessionStats {
    return this.sessions.stats(id);
  }
}

@Controller('alerts')
export class AlertsController {
  constructor(private readonly sessions: SessionService) {}

  @Post(':id/resolve')
  @HttpCode(200)
  resolve(@Param('id') id: string): ResolveAlertResponse {
    return this.sessions.resolveAlert(id);
  }
}
