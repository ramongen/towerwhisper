import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@towerwhisper/shared';
import { AppModeService } from './app-mode.service';

@Controller('health')
export class HealthController {
  constructor(private readonly appMode: AppModeService) {}

  @Get()
  health(): HealthResponse {
    return { status: 'ok', mode: this.appMode.mode };
  }
}
