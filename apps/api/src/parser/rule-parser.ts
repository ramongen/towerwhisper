import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Clearance } from '@towerwhisper/shared';

/** Regex rules over normalised text for standard ICAO phraseology. Returns null when no rule matched. */
@Injectable()
export class RuleParser {
  parse(_normalized: string, _speaker: Clearance['speaker']): Partial<Clearance> | null {
    throw new NotImplementedException('RuleParser.parse');
  }
}
