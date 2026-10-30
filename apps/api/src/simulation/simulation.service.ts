import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Aircraft, Targets } from '@towerwhisper/shared';

/** The 250 ms tick loop: updates position, heading, altitude and speed of every aircraft. */
@Injectable()
export class SimulationService {
  getAircraft(): Aircraft[] {
    throw new NotImplementedException('SimulationService.getAircraft');
  }

  setTargets(_callsign: string, _targets: Targets): void {
    throw new NotImplementedException('SimulationService.setTargets');
  }
}
