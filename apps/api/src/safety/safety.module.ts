import { Module } from '@nestjs/common';
import { DemoControlModule } from '../demo/demo.module';
import { SimulationModule } from '../simulation/simulation.module';
import { AlertRegistry } from './alert-registry';
import { ClearanceProbe } from './clearance-probe';
import { CommsWatchdog } from './comms-watchdog';
import { ConformanceMonitor } from './conformance-monitor';
import { ReadbackChecker } from './readback-checker';
import { SafetyMonitorService } from './safety-monitor.service';

/** Deterministic safety checks. No LLM and no network calls in this module. */
@Module({
  imports: [SimulationModule, DemoControlModule],
  providers: [
    AlertRegistry,
    ReadbackChecker,
    ConformanceMonitor,
    CommsWatchdog,
    ClearanceProbe,
    SafetyMonitorService,
  ],
  exports: [AlertRegistry, ReadbackChecker, ConformanceMonitor, CommsWatchdog, ClearanceProbe],
})
export class SafetyModule {}
