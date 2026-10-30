import { Module } from '@nestjs/common';
import { ParserModule } from '../parser/parser.module';
import { PilotModule } from '../pilot/pilot.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SafetyModule } from '../safety/safety.module';
import { SessionModule } from '../session/session.module';
import { SimulationModule } from '../simulation/simulation.module';
import { VoiceModule } from '../voice/voice.module';
import { TransmissionController } from './transmission.controller';
import { TransmissionService } from './transmission.service';

/** POST /transmissions (PTT audio) and /transmissions/text: the controller -> pilot pipeline. */
@Module({
  imports: [
    VoiceModule,
    ParserModule,
    SimulationModule,
    SafetyModule,
    PilotModule,
    RealtimeModule,
    SessionModule,
  ],
  controllers: [TransmissionController],
  providers: [TransmissionService],
})
export class TransmissionsModule {}
