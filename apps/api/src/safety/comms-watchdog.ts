import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Aircraft, FaultConfig } from '@towerwhisper/shared';

/** Runs every tick: NO_CONTACT caution at the first limit, upgraded to warning at the second. */
@Injectable()
export class CommsWatchdog {
  tick(_aircraft: Aircraft[], _limits: FaultConfig['commsLimits']): void {
    throw new NotImplementedException('CommsWatchdog.tick');
  }
}
