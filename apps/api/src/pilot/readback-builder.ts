import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Aircraft, Clearance, FaultConfig } from '@towerwhisper/shared';

/** Builds the pilot readback from templates (deterministic), altered by the active readback fault. */
@Injectable()
export class ReadbackBuilder {
  build(
    _clearance: Clearance,
    _aircraft: Aircraft,
    _fault: FaultConfig['readback'],
  ): string | null {
    throw new NotImplementedException('ReadbackBuilder.build');
  }
}
