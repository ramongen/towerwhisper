import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Clearance } from '@towerwhisper/shared';

/** Schedules the readback and the execution of a clearance, applying demo-panel faults. */
@Injectable()
export class PilotService {
  handleClearance(_clearance: Clearance): void {
    throw new NotImplementedException('PilotService.handleClearance');
  }
}
