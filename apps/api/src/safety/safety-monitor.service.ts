import type { Aircraft } from '@towerwhisper/shared';
import { FaultService } from '../demo/fault.service';
import { SimulationService } from '../simulation/simulation.service';
import { ClearanceProbe } from './clearance-probe';
import { CommsWatchdog } from './comms-watchdog';
import { ConformanceMonitor } from './conformance-monitor';
import { PROBE_INTERVAL_S } from './constants';
import { ReadbackChecker } from './readback-checker';

/** Runs the per-tick safety checks of one sector on every simulation tick. */
export class SafetyMonitorService {
  private lastProbeMs = 0;

  constructor(
    private readonly simulation: SimulationService,
    private readonly faults: FaultService,
    private readonly readback: ReadbackChecker,
    private readonly conformance: ConformanceMonitor,
    private readonly watchdog: CommsWatchdog,
    private readonly probe: ClearanceProbe,
  ) {
    this.simulation.onTick((aircraft, simNowMs) => this.tick(aircraft, simNowMs));
  }

  private tick(aircraft: Aircraft[], simNowMs: number): void {
    this.readback.tick(simNowMs);
    this.conformance.tick(aircraft, simNowMs);
    this.watchdog.tick(aircraft, this.faults.getConfig().commsLimits);
    if (Math.abs(simNowMs - this.lastProbeMs) >= PROBE_INTERVAL_S * 1000) {
      this.lastProbeMs = simNowMs;
      this.probe.scan(aircraft);
    }
  }
}
