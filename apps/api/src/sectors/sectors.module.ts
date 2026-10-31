import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AirportController } from '../airport/airport.controller';
import { AuthModule } from '../auth/auth.module';
import { ENTITIES } from '../database/entities';
import { DemoHistoryService } from '../demo/demo-history.service';
import { DemoController } from '../demo/demo.controller';
import { ParserModule } from '../parser/parser.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AlertsController, SessionController } from '../session/session.controller';
import { SupervisorController } from '../supervisor/supervisor.controller';
import { SupervisorService } from '../supervisor/supervisor.service';
import { UsersController } from '../supervisor/users.controller';
import { TransmissionController } from '../transmissions/transmission.controller';
import { TransmissionService } from '../transmissions/transmission.service';
import { VoiceModule } from '../voice/voice.module';
import { RadarService } from '../weather/radar.service';
import { WeatherController } from '../weather/weather.controller';
import { SectorRegistry } from './sector-registry';
import { SessionStore } from './session-store';

/**
 * The live sectors: one runtime per approach sector (simulation, safety checks, pilots,
 * faults, weather, recording), the socket gateway that routes screens to them, and every
 * REST route that acts on a sector or reads what they recorded.
 */
@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES), ParserModule, VoiceModule, AuthModule],
  controllers: [
    SessionController,
    AlertsController,
    TransmissionController,
    DemoController,
    AirportController,
    WeatherController,
    UsersController,
    SupervisorController,
  ],
  providers: [
    SessionStore,
    SectorRegistry,
    RealtimeGateway,
    TransmissionService,
    SupervisorService,
    RadarService,
    DemoHistoryService,
  ],
})
export class SectorsModule {}
