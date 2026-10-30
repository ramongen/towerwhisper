import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Aircraft } from '@towerwhisper/shared';

/** Runs every tick: WRONG_TURN, WRONG_VERTICAL, LEVEL_BUST, with a 4 s persistence window. */
@Injectable()
export class ConformanceMonitor {
  tick(_aircraft: Aircraft[], _simTimeS: number): void {
    throw new NotImplementedException('ConformanceMonitor.tick');
  }
}
