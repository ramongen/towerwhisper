import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModeService } from './app-mode.service';
import { AuthModule } from './auth/auth.module';
import { ENTITIES } from './database/entities';
import { HealthController } from './health.controller';
import { ParserModule } from './parser/parser.module';
import { SectorsModule } from './sectors/sectors.module';
import { VoiceModule } from './voice/voice.module';

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
    AuthModule,
    ParserModule,
    VoiceModule,
    SectorsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
