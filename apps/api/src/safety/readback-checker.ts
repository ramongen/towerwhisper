import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Alert, Clearance, ReadbackCheck } from '@towerwhisper/shared';

/** Compares a parsed readback with the instruction it answers (HEARBACK_MISMATCH, READBACK_INCOMPLETE). */
@Injectable()
export class ReadbackChecker {
  check(
    _instruction: Clearance,
    _readback: Clearance,
  ): { check: ReadbackCheck; alert: Alert | null } {
    throw new NotImplementedException('ReadbackChecker.check');
  }
}
