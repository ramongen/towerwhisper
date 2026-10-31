import { Logger } from '@nestjs/common';
import type { Clearance, CommsReadbackPayload } from '@towerwhisper/shared';
import { randomUUID } from 'node:crypto';
import { FaultService } from '../demo/fault.service';
import { ParserService } from '../parser/parser.service';
import { ConformanceMonitor } from '../safety/conformance-monitor';
import { ReadbackChecker, compare } from '../safety/readback-checker';
import { SimulationService, type SimEvent } from '../simulation/simulation.service';
import { TtsService } from '../voice/tts.service';
import {
  EXECUTION_DELAY_MAX_MS,
  EXECUTION_DELAY_MIN_MS,
  PILOT_RESPONSE_DELAY_MS,
} from './constants';
import { ReadbackBuilder } from './readback-builder';
import { executionFaultApplies, faultyTargets, targetsFor } from './targets';

/**
 * Runs a pilot step after `ms`. The live sectors use real timers; a headless run (the demo
 * history) passes one driven by simulation time.
 */
export type PilotScheduler = (ms: number, step: () => void | Promise<void>) => void;

/**
 * The simulated pilot. ~1.5 s after an instruction it reads back (template text + TTS),
 * the readback goes through the same parser and the ReadbackChecker, then 2-3 s later
 * the aircraft starts the manoeuvre. Demo faults change what is said or flown.
 * On the final approach the pilot also calls unprompted: to ask for landing clearance, and
 * when going around because it did not come. One per sector.
 */
export class PilotService {
  private readonly logger: Logger;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly builder: ReadbackBuilder,
    private readonly parser: ParserService,
    private readonly tts: TtsService,
    private readonly simulation: SimulationService,
    private readonly faults: FaultService,
    private readonly readbackChecker: ReadbackChecker,
    private readonly conformance: ConformanceMonitor,
    /** Puts a pilot transmission on the sector's frequency (screens, recording). */
    private readonly broadcast: (payload: CommsReadbackPayload) => void,
    /** Who the pilot calls for landing clearance: 'Craiova Tower'. */
    private readonly towerCallsign: string,
    private readonly schedule?: PilotScheduler,
  ) {
    this.logger = new Logger(`Pilot ${simulation.airspace.airport.icao}`);
    this.simulation.onEvent((event) => void this.onSimEvent(event));
  }

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
    this.broadcast({
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
      const targets = faultyTargets(fault, instruction, aircraft, this.simulation.airspace);
      this.logger.log(`${callsign}: execution fault ${fault.kind}`);
      if (targets) this.simulation.setTargets(callsign, targets, instruction.id);
      return;
    }
    if (instruction.goAround) this.simulation.goAround(callsign, 'instructed');
    this.simulation.setTargets(
      callsign,
      targetsFor(instruction, this.simulation.airspace),
      instruction.id,
    );
  }

  /** Calls the pilot makes without being asked (no readback check). */
  private async onSimEvent(event: SimEvent): Promise<void> {
    const aircraft = this.simulation.get(event.callsign);
    const telephony = aircraft?.telephony ?? event.callsign;
    let text: string | null = null;
    if (event.type === 'landing-request') {
      text = callText(this.towerCallsign, telephony, event.runway, event.distanceNm);
    } else if (event.type === 'go-around' && event.reason === 'no landing clearance') {
      text = 'Going around, no landing clearance, ' + telephony;
    }
    if (!text) return;

    const audioUrl = await this.tts.synthesize(text, event.callsign);
    this.simulation.touchContact(event.callsign);
    this.broadcast({
      id: randomUUID(),
      at: new Date().toISOString(),
      speaker: 'pilot',
      callsign: event.callsign,
      transcript: text,
      clearance: null,
      audioUrl,
      check: null,
    });
  }

  private later(ms: number, fn: () => void | Promise<void>): void {
    if (this.schedule) return this.schedule(ms, fn);
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      Promise.resolve(fn()).catch((error: Error) =>
        this.logger.error(`Pilot step failed: ${error.stack}`),
      );
    }, ms);
    this.timers.add(timer);
  }
}

/** 'Craiova Tower, WIZZ 44, established ILS runway 26, 8 miles, request landing clearance' */
function callText(tower: string, telephony: string, runway: string, distanceNm: number): string {
  return (
    tower +
    ', ' +
    telephony +
    ', established runway ' +
    runway +
    ', ' +
    distanceNm +
    ' miles, request landing clearance'
  );
}
