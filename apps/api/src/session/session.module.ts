import { Module } from '@nestjs/common';
import { ScenarioLoader } from './scenario-loader';
import { SessionService } from './session.service';

@Module({
  providers: [SessionService, ScenarioLoader],
  exports: [SessionService, ScenarioLoader],
})
export class SessionModule {}
