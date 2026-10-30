import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DemoTriggerName, FaultConfig } from '@towerwhisper/shared';
import { DEFAULT_COMMS_CAUTION_MIN, DEFAULT_COMMS_WARNING_MIN } from '../safety/constants';
import { DEFAULT_RADIO_NOISE } from './constants';

/** Holds the demo-panel fault configuration and fires scenario triggers. */
@Injectable()
export class FaultService {
  private config: FaultConfig;

  constructor(env: ConfigService) {
    const cautionMin = Number(env.get('COMMS_CAUTION_MIN') ?? DEFAULT_COMMS_CAUTION_MIN);
    const warningMin = Number(env.get('COMMS_WARNING_MIN') ?? DEFAULT_COMMS_WARNING_MIN);
    this.config = {
      target: { mode: 'selected' },
      readback: null,
      execution: null,
      radioNoise: DEFAULT_RADIO_NOISE,
      timeScale: 1,
      commsLimits: { cautionS: cautionMin * 60, warningS: warningMin * 60 },
    };
  }

  getConfig(): FaultConfig {
    return this.config;
  }

  setConfig(_config: FaultConfig): FaultConfig {
    throw new NotImplementedException('FaultService.setConfig');
  }

  trigger(_name: DemoTriggerName, _body: unknown): void {
    throw new NotImplementedException('FaultService.trigger');
  }
}
