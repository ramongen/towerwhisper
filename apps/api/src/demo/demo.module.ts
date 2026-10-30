import { Module } from '@nestjs/common';
import { SimulationModule } from '../simulation/simulation.module';
import { DemoController } from './demo.controller';
import { FaultService } from './fault.service';

@Module({
  imports: [SimulationModule],
  controllers: [DemoController],
  providers: [FaultService],
  exports: [FaultService],
})
export class DemoControlModule {}
