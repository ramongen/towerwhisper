import { Module } from '@nestjs/common';
import { DemoControlModule } from '../demo/demo.module';
import { SafetyModule } from '../safety/safety.module';
import { SimulationModule } from '../simulation/simulation.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [SimulationModule, SafetyModule, DemoControlModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
