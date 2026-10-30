import { Injectable } from '@nestjs/common';
import type { Clearance } from '@towerwhisper/shared';

/** Claude (Haiku) fallback, only when RuleParser found nothing. Disabled in no-keys mode. */
@Injectable()
export class LlmParser {
  parse(_text: string, _activeCallsigns: string[]): Promise<Partial<Clearance> | null> {
    return Promise.resolve(null);
  }
}
