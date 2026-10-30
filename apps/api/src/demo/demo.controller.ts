import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import type { DemoTriggerResponse, FaultConfig } from '@towerwhisper/shared';
import { FaultService } from './fault.service';

/** Hidden demo panel API: fault configuration and scenario triggers. */
@Controller('demo')
export class DemoController {
  constructor(private readonly faults: FaultService) {}

  @Get('faults')
  getFaults(): FaultConfig {
    return this.faults.getConfig();
  }

  @Put('faults')
  putFaults(@Body() config: FaultConfig): FaultConfig {
    return this.faults.setConfig(config);
  }

  @Post('triggers/:name')
  @HttpCode(200)
  trigger(
    @Param('name') name: string,
    @Body() body: Record<string, unknown> = {},
  ): DemoTriggerResponse {
    return this.faults.trigger(name, body ?? {});
  }
}
