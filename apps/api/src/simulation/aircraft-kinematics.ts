import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Aircraft } from '@towerwhisper/shared';

/** Moves one aircraft towards its targets (local flat-earth approximation around LRCV). */
@Injectable()
export class AircraftKinematics {
  step(_aircraft: Aircraft, _dtS: number): Aircraft {
    throw new NotImplementedException('AircraftKinematics.step');
  }
}
