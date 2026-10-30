import { Module } from '@nestjs/common';
import { AircraftKinematics } from './aircraft-kinematics';
import { SimulationService } from './simulation.service';

@Module({
  providers: [SimulationService, AircraftKinematics],
  exports: [SimulationService],
})
export class SimulationModule {}
