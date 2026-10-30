import { Injectable, NotImplementedException } from '@nestjs/common';
import type { CreateSessionResponse, SessionStats } from '@towerwhisper/shared';

/** Starts, resets and persists a demo session with the chosen scenario. */
@Injectable()
export class SessionService {
  create(_scenario: string): Promise<CreateSessionResponse> {
    throw new NotImplementedException('SessionService.create');
  }

  reset(_sessionId: string): Promise<void> {
    throw new NotImplementedException('SessionService.reset');
  }

  stats(_sessionId: string): Promise<SessionStats> {
    throw new NotImplementedException('SessionService.stats');
  }
}
