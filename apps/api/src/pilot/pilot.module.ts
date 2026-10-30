import { Module } from '@nestjs/common';
import { DemoControlModule } from '../demo/demo.module';
import { ParserModule } from '../parser/parser.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SafetyModule } from '../safety/safety.module';
import { SimulationModule } from '../simulation/simulation.module';
import { VoiceModule } from '../voice/voice.module';
import { PilotService } from './pilot.service';
import { ReadbackBuilder } from './readback-builder';

@Module({
  imports: [
    ParserModule,
    VoiceModule,
    SimulationModule,
    DemoControlModule,
    SafetyModule,
    RealtimeModule,
  ],
  providers: [PilotService, ReadbackBuilder],
  exports: [PilotService, ReadbackBuilder],
})
export class PilotModule {}
