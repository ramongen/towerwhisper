import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Aircraft, Clearance, ProbeResultPayload } from '@towerwhisper/shared';

/** Bonus: projects the cleared trajectory and predicts conflicts (CONFLICT_PREDICTED). */
@Injectable()
export class ClearanceProbe {
  probe(_clearance: Clearance, _aircraft: Aircraft[]): ProbeResultPayload {
    throw new NotImplementedException('ClearanceProbe.probe');
  }
}
