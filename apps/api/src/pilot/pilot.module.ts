import { Module } from '@nestjs/common';
import { PilotService } from './pilot.service';
import { ReadbackBuilder } from './readback-builder';

@Module({
  providers: [PilotService, ReadbackBuilder],
  exports: [PilotService],
})
export class PilotModule {}
