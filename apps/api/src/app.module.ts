import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModeService } from './app-mode.service';
import { ENTITIES } from './database/entities';
import { DemoControlModule } from './demo/demo.module';
import { HealthController } from './health.controller';
import { ParserModule } from './parser/parser.module';
import { PilotModule } from './pilot/pilot.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SafetyModule } from './safety/safety.module';
import { SessionModule } from './session/session.module';
import { SimulationModule } from './simulation/simulation.module';
import { TransmissionsModule } from './transmissions/transmissions.module';
import { VoiceModule } from './voice/voice.module';
import { WeatherModule } from './weather/weather.module';

const DEFAULT_DATABASE_URL = 'postgres://towerwhisper:towerwhisper@localhost:5432/towerwhisper';

@Global()
@Module({
  providers: [AppModeService],
  exports: [AppModeService],
})
class AppModeModule {}

@Module({
  imports: [
    // .env is optional: apps/api/.env first, then the repo root .env (local dev).
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL') ?? DEFAULT_DATABASE_URL,
        entities: ENTITIES,
        synchronize: true, // acceptable for the hackathon; no migrations
      }),
    }),
    AppModeModule,
    SessionModule,
    SimulationModule,
    VoiceModule,
    ParserModule,
    PilotModule,
    SafetyModule,
    DemoControlModule,
    RealtimeModule,
    TransmissionsModule,
    WeatherModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
