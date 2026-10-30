import { Module } from '@nestjs/common';
import { AlertRegistry } from './alert-registry';
import { ClearanceProbe } from './clearance-probe';
import { CommsWatchdog } from './comms-watchdog';
import { ConformanceMonitor } from './conformance-monitor';
import { ReadbackChecker } from './readback-checker';

/** Deterministic safety checks. No LLM and no network calls in this module. */
@Module({
  providers: [AlertRegistry, ReadbackChecker, ConformanceMonitor, CommsWatchdog, ClearanceProbe],
  exports: [AlertRegistry, ReadbackChecker, ConformanceMonitor, CommsWatchdog, ClearanceProbe],
})
export class SafetyModule {}
