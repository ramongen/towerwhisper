import { Module } from '@nestjs/common';
import { ClearanceProbe } from './clearance-probe';
import { CommsWatchdog } from './comms-watchdog';
import { ConformanceMonitor } from './conformance-monitor';
import { ReadbackChecker } from './readback-checker';

@Module({
  providers: [ReadbackChecker, ConformanceMonitor, CommsWatchdog, ClearanceProbe],
  exports: [ReadbackChecker, ConformanceMonitor, CommsWatchdog, ClearanceProbe],
})
export class SafetyModule {}
