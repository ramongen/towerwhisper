import { Injectable, Logger } from '@nestjs/common';
import type { Clearance } from '@towerwhisper/shared';
import { randomUUID } from 'node:crypto';
import { FaultService } from '../demo/fault.service';
import { ParserService } from '../parser/parser.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ConformanceMonitor } from '../safety/conformance-monitor';
import { ReadbackChecker, compare } from '../safety/readback-checker';
import { SimulationService } from '../simulation/simulation.service';
import { TtsService } from '../voice/tts.service';
import {
  EXECUTION_DELAY_MAX_MS,
  EXECUTION_DELAY_MIN_MS,
  PILOT_RESPONSE_DELAY_MS,
} from './constants';
import { ReadbackBuilder } from './readback-builder';
import { executionFaultApplies, faultyTargets, targetsFor } from './targets';

/**
 * The simulated pilot. ~1.5 s after an instruction it reads back (template text + TTS),
 * the readback goes through the same parser and the ReadbackChecker, then 2-3 s later
 * the aircraft starts the manoeuvre. Demo faults change what is said or flown.
 */
@Injectable()
export class PilotService {
  private readonly logger = new Logger(PilotService.name);
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly builder: ReadbackBuilder,
    private readonly parser: ParserService,
    private readonly tts: TtsService,
    private readonly simulation: SimulationService,
    private readonly faults: FaultService,
    private readonly readbackChecker: ReadbackChecker,
    private readonly conformance: ConformanceMonitor,
    private readonly realtime: RealtimeGateway,
  ) {}

  handleInstruction(instruction: Clearance): void {
    this.later(PILOT_RESPONSE_DELAY_MS, () => this.readBack(instruction));
  }

  /** Scenario reset: drop every pending readback and manoeuvre. */
  cancelAll(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private async readBack(instruction: Clearance): Promise<void> {
    const callsign = instruction.callsign;
    const aircraft = this.simulation.getAircraft();
    if (!aircraft.some((a) => a.callsign === callsign)) return;

    const fault = this.faults.readbackFaultFor(callsign);
    if (fault?.kind === 'no_response') {
      this.faults.consumeReadbackFault(callsign); // silence; ReadbackChecker raises NO_RESPONSE at 8 s
      return;
    }

    const steppedOn = this.faults.takeSteppedOn(callsign);
    const readback = this.builder.build(instruction, aircraft, fault, steppedOn);
    if (!readback) return;
    if (fault && readback.faultApplied) this.faults.consumeReadbackFault(callsign);

    const parsed = await this.parser.parse({
      text: readback.text,
      speaker: 'pilot',
      candidates: aircraft,
      selectedCallsign: readback.callsign, // a cut-off readback has no callsign in it
      fixes: this.simulation.getFixes().map((f) => f.name),
    });
    const heardFrom = parsed?.callsign ?? readback.callsign;
    const hasWords = /[a-z0-9]/i.test(readback.text);
    const audioUrl = hasWords ? await this.tts.synthesize(readback.text, readback.callsign) : null;

    this.simulation.touchContact(readback.callsign);
    this.realtime.broadcastReadback({
      id: randomUUID(),
      at: new Date().toISOString(),
      speaker: 'pilot',
      callsign: readback.callsign,
      transcript: readback.text,
      clearance: parsed,
      audioUrl,
      check: compare(instruction, parsed, heardFrom).check,
    });
    // Raise the alert after the readback entry is on screen.
    this.readbackChecker.check(instruction, parsed, heardFrom);

    // Only the addressed aircraft flies the instruction, and only if it answered itself.
    if (readback.callsign !== callsign) return;
    const own = this.simulation.get(callsign);
    if (own) this.conformance.watch(instruction, own, this.simulation.simNowMs());
    const delay =
      EXECUTION_DELAY_MIN_MS + Math.random() * (EXECUTION_DELAY_MAX_MS - EXECUTION_DELAY_MIN_MS);
    this.later(delay, () => this.execute(instruction));
  }

  private execute(instruction: Clearance): void {
    const callsign = instruction.callsign;
    const aircraft = this.simulation.get(callsign);
    if (!aircraft) return;

    const fault = this.faults.executionFaultFor(callsign);
    if (fault && executionFaultApplies(fault, instruction)) {
      this.faults.consumeExecutionFault(callsign);
      const targets = faultyTargets(fault, instruction, aircraft);
      this.logger.log(`${callsign}: execution fault ${fault.kind}`);
      if (targets) this.simulation.setTargets(callsign, targets, instruction.id);
      return;
    }
    this.simulation.setTargets(callsign, targetsFor(instruction), instruction.id);
  }

  private later(ms: number, fn: () => void | Promise<void>): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      Promise.resolve(fn()).catch((error: Error) =>
        this.logger.error(`Pilot step failed: ${error.stack}`),
      );
    }, ms);
    this.timers.add(timer);
  }
}
