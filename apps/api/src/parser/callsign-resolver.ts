import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Aircraft, Clearance } from '@towerwhisper/shared';

/** Fuzzy-matches the spoken callsign against aircraft in the session; falls back to the radar selection. */
@Injectable()
export class CallsignResolver {
  resolve(
    _text: string,
    _speaker: Clearance['speaker'],
    _aircraft: Aircraft[],
    _selectedCallsign?: string,
  ): string | null {
    throw new NotImplementedException('CallsignResolver.resolve');
  }
}
