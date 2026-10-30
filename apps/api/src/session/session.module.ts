import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from '../database/entities';
import { DemoControlModule } from '../demo/demo.module';
import { ParserModule } from '../parser/parser.module';
import { PilotModule } from '../pilot/pilot.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SafetyModule } from '../safety/safety.module';
import { SimulationModule } from '../simulation/simulation.module';
import { ScenarioLoader } from './scenario-loader';
import { AlertsController, SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    SimulationModule,
    SafetyModule,
    DemoControlModule,
    RealtimeModule,
    PilotModule,
    ParserModule,
  ],
  controllers: [SessionController, AlertsController],
  providers: [SessionService, ScenarioLoader],
  exports: [SessionService, ScenarioLoader],
})
export class SessionModule {}
