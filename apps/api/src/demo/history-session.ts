import type {
  Aircraft,
  Alert,
  CommsReadbackPayload,
  CommsTransmissionPayload,
  FaultConfig,
} from '@towerwhisper/shared';
import { randomUUID } from 'node:crypto';
import type { ParserService } from '../parser/parser.service';
import { PilotService } from '../pilot/pilot.service';
import { ReadbackBuilder } from '../pilot/readback-builder';
import { targetsFor } from '../pilot/targets';
import { AlertRegistry } from '../safety/alert-registry';
import { ClearanceProbe } from '../safety/clearance-probe';
import { CommsWatchdog } from '../safety/comms-watchdog';
import { ConformanceMonitor } from '../safety/conformance-monitor';
import { ReadbackChecker } from '../safety/readback-checker';
import { SafetyMonitorService } from '../safety/safety-monitor.service';
import { generateArrivals } from '../sectors/arrivals';
import { FRAME_INTERVAL_MS, TRANSITION_ALTITUDE_FT } from '../sectors/constants';
import type { Sector } from '../sectors/sectors';
import { AircraftKinematics } from '../simulation/aircraft-kinematics';
import { SimulationService } from '../simulation/simulation.service';
import type { TtsService } from '../voice/tts.service';
import {
  HISTORY_CALL_JITTER_S,
  HISTORY_CALL_SPACING_S,
  HISTORY_FIRST_CALL_S,
  HISTORY_INCIDENTS,
  HISTORY_LANDING_REPLY_S,
  HISTORY_REACTIONS,
  HISTORY_VECTOR_S,
  HISTORY_YIELD_TICKS,
} from './constants';
import { FaultService } from './fault.service';

type CommsPayload = CommsTransmissionPayload | CommsReadbackPayload;
type ReadbackFaultKind = NonNullable<FaultConfig['readback']>['kind'];
type ExecutionFaultKind = NonNullable<FaultConfig['execution']>['kind'];

/** What goes wrong with one arrival in a past session. */
type Incident =
  | { on: 'descend' | 'heading' | 'landing'; readback: ReadbackFaultKind }
  | { on: 'descend' | 'heading'; execution: ExecutionFaultKind }
  | { on: 'age-comms' | 'conflict' };

/** Incident kinds and how often each comes up (weights). */
const INCIDENTS: [Incident, number][] = [
  [{ on: 'descend', readback: 'wrong_altitude' }, 3],
  [{ on: 'descend', readback: 'incomplete' }, 2],
  [{ on: 'descend', readback: 'no_response' }, 2],
  [{ on: 'descend', readback: 'wrong_callsign' }, 1],
  [{ on: 'heading', readback: 'wrong_heading' }, 1],
  [{ on: 'heading', readback: 'wrong_turn' }, 1],
  [{ on: 'landing', readback: 'wrong_runway' }, 1],
  [{ on: 'descend', execution: 'level_bust' }, 2],
  [{ on: 'descend', execution: 'wrong_vertical' }, 1],
  [{ on: 'heading', execution: 'turn_wrong_way' }, 2],
  [{ on: 'age-comms' }, 2],
  [{ on: 'conflict' }, 1],
];

export interface HistoryController {
  id: string;
  name: string;
}

/** One past session, ready to be written: timestamps are already in the past. */
export interface RecordedSession {
  startedAt: Date;
  endedAt: Date;
  comms: { payload: CommsPayload; userId: string | null }[];
  alerts: { alert: Alert; resolvedBy: string | null }[];
  frames: { at: Date; aircraft: Aircraft[] }[];
}

export interface HistorySessionOptions {
  sector: Sector;
  parser: ParserService;
  controller: HistoryController;
  commsLimits: FaultConfig['commsLimits'];
  startedAt: Date;
  minutes: number;
  recordRadar: boolean;
  /** Random numbers in [0, 1); seeded by the caller so a session can be reproduced. */
  random: () => number;
}

/** No audio in the history: the replay shows the transcripts. */
const SILENT_TTS = { synthesize: () => Promise.resolve(null) } as unknown as TtsService;

/**
 * Records one past session of a sector without waiting for it: the real simulation, pilots,
 * demo faults and safety checks (wired as in SectorRuntime) run on simulation time, tick
 * after tick, as fast as the CPU allows. A scripted controller calls every arrival, answers
 * landing requests and reacts to the alerts; some calls go wrong on purpose (the demo
 * panel's faults), so the history holds the same alerts, messages and tracks a live
 * session would. Only timestamps are moved to `startedAt`.
 */
export class HistorySession {
  private readonly simulation: SimulationService;
  private readonly alerts = new AlertRegistry();
  private readonly readbackChecker: ReadbackChecker;
  private readonly probe: ClearanceProbe;
  private readonly faults: FaultService;
  private readonly pilot: PilotService;
  private readonly simStartMs: number;
  /** Pilot steps and controller actions, by simulation time. */
  private tasks: { atMs: number; run: () => void | Promise<void> }[] = [];
  private readonly lastCall = new Map<string, string>();
  /** Readback faults armed for the landing clearance (wrong runway). */
  private readonly armOnLanding = new Map<string, Incident>();
  private readonly resolvedBy = new Map<string, string>();
  private readonly seen = new Map<string, Alert>();
  private readonly recorded: RecordedSession;
  private lastFrameMs = 0;

  constructor(private readonly o: HistorySessionOptions) {
    const airspace = o.sector.airspace;
    this.simulation = new SimulationService(new AircraftKinematics(airspace));
    this.readbackChecker = new ReadbackChecker(this.alerts);
    const conformance = new ConformanceMonitor(this.alerts);
    this.probe = new ClearanceProbe(this.alerts, airspace.airport.lat);
    this.faults = new FaultService(o.commsLimits, this.simulation);
    this.pilot = new PilotService(
      new ReadbackBuilder(airspace),
      o.parser,
      SILENT_TTS,
      this.simulation,
      this.faults,
      this.readbackChecker,
      conformance,
      (payload) => this.record(payload, null),
      o.sector.definition.towerCallsign,
      (ms, run) => this.after(ms / 1000, run),
    );
    new SafetyMonitorService(
      this.simulation,
      this.faults,
      this.readbackChecker,
      conformance,
      new CommsWatchdog(this.alerts),
      this.probe,
    );

    const scenario = generateArrivals(o.sector.definition.id, airspace);
    this.simulation.load(scenario.aircraft, scenario.fixes);
    this.simStartMs = this.simulation.simNowMs();
    this.recorded = {
      startedAt: o.startedAt,
      endedAt: new Date(o.startedAt.getTime() + o.minutes * 60_000),
      comms: [],
      alerts: [],
      frames: [],
    };

    this.alerts.subscribe({
      raised: (alert) => this.onRaised(alert),
      cleared: (alert) => (alert.endedAt = this.nowIso()),
    });
    this.simulation.onEvent((event) => {
      if (event.type !== 'landing-request') return;
      this.after(this.between(HISTORY_LANDING_REPLY_S), () =>
        this.landingClearance(event.callsign, event.runway),
      );
    });
    if (o.recordRadar) this.simulation.onTick((aircraft) => this.recordFrame(aircraft));
  }

  async run(): Promise<RecordedSession> {
    this.planCalls();
    const endMs = this.simStartMs + this.o.minutes * 60_000;
    for (let ticks = 1; this.simulation.simNowMs() < endMs; ticks++) {
      this.simulation.step();
      await this.runDue();
      // The live sectors run on timers in the same process: let them tick now and then.
      if (ticks % HISTORY_YIELD_TICKS === 0) await new Promise((r) => setImmediate(r));
    }
    // The session ended: so did the alerts still open in it (as SessionStore.endSession).
    for (const alert of this.alerts.list()) {
      alert.endedAt = this.recorded.endedAt.toISOString();
      alert.outcome = 'cleared';
      alert.endReason = 'session ended';
    }
    this.recorded.alerts = [...this.seen.values()].map((alert) => ({
      alert,
      resolvedBy: this.resolvedBy.get(alert.id) ?? null,
    }));
    return this.recorded;
  }

  // --- The scripted controller -------------------------------------------------------------

  /** A first call to every arrival, spaced out; some of them carry an incident. */
  private planCalls(): void {
    const aircraft = this.simulation.getAircraft();
    const count = Math.min(
      aircraft.length,
      HISTORY_INCIDENTS.min +
        Math.floor(this.o.random() * (HISTORY_INCIDENTS.max - HISTORY_INCIDENTS.min + 1)),
    );
    const unlucky = this.shuffle(aircraft.map((_, i) => i)).slice(0, count);
    let conflictPlanned = false;

    aircraft.forEach((a, i) => {
      const atS =
        HISTORY_FIRST_CALL_S + i * HISTORY_CALL_SPACING_S + this.o.random() * HISTORY_CALL_JITTER_S;
      let incident = unlucky.includes(i) ? this.pickIncident() : null;
      if (incident?.on === 'conflict') {
        if (conflictPlanned) incident = { on: 'descend', readback: 'wrong_altitude' };
        conflictPlanned = true;
      }
      this.after(atS, () => this.firstCall(a.callsign, incident));
    });
  }

  private firstCall(callsign: string, incident: Incident | null): void {
    const a = this.simulation.get(callsign);
    if (!a) return;
    if (incident?.on === 'landing') {
      this.armOnLanding.set(callsign, incident);
      incident = null;
    }
    if (incident?.on === 'age-comms' || incident?.on === 'conflict') {
      const trigger = incident.on;
      this.after(20 + this.o.random() * 40, () => this.trigger(trigger, callsign));
      incident = null;
    }
    // A vector only when the aircraft can be sent back to a published fix of its route
    // afterwards (simulated points such as CF26 are not spoken); else a heading incident
    // becomes its descent equivalent.
    const fix = a.nextWaypoint && SPOKEN_FIX.test(a.nextWaypoint) ? a.nextWaypoint : null;
    if (incident?.on === 'heading' && !fix) incident = descentEquivalent(incident);
    const vector = !!fix && (incident?.on === 'heading' || (!incident && this.o.random() < 0.3));
    if (incident) this.arm(callsign, incident);

    if (vector) {
      const turn = this.o.random() < 0.5 ? 'left' : 'right';
      const heading = roundTo(a.headingDeg + (turn === 'left' ? -20 : 20), 5);
      this.transmit(`${a.telephony}, turn ${turn} heading ${pad3(heading)}`);
      // Back on its route afterwards, so it still reaches the approach by itself.
      this.after(this.between(HISTORY_VECTOR_S), () =>
        this.transmit(`${a.telephony}, proceed direct ${fix}`),
      );
      return;
    }
    const withSpeed =
      (incident && 'readback' in incident && incident.readback === 'incomplete') ||
      this.o.random() < 0.35;
    this.transmit(descendText(a, withSpeed));
  }

  private landingClearance(callsign: string, runway: string): void {
    const a = this.simulation.get(callsign);
    if (!a) return;
    const incident = this.armOnLanding.get(callsign);
    if (incident) {
      this.armOnLanding.delete(callsign);
      this.arm(callsign, incident);
    }
    this.transmit(`${a.telephony}, cleared to land runway ${spokenRunway(runway)}`);
  }

  /** A demo-panel fault on the next readback or manoeuvre of this aircraft. */
  private arm(callsign: string, incident: Incident): void {
    const config = this.faults.getConfig();
    this.faults.setConfig({
      ...config,
      target: { mode: 'callsign', callsign },
      readback: 'readback' in incident ? { kind: incident.readback, once: true } : config.readback,
      execution:
        'execution' in incident ? { kind: incident.execution, once: true } : config.execution,
    });
  }

  private trigger(kind: 'age-comms' | 'conflict', callsign: string): void {
    if (!this.simulation.get(callsign)) return;
    if (kind === 'conflict') {
      this.faults.setSelectedCallsign(callsign);
      this.faults.trigger('conflict', {});
      this.faults.setSelectedCallsign(null);
      return;
    }
    const { cautionS, warningS } = this.o.commsLimits;
    const ageS =
      this.o.random() < 0.3
        ? warningS + 30 + this.o.random() * 240
        : cautionS + 30 + this.o.random() * 600;
    this.faults.trigger('age-comms', { callsign, ageS: Math.round(ageS) });
  }

  /** The controller sees a new alert: resolves it and/or repeats the instruction, a bit later. */
  private onRaised(alert: Alert): void {
    if (this.seen.has(alert.id)) return; // an update (caution -> warning) of the same alert
    alert.raisedAt = this.nowIso();
    this.seen.set(alert.id, alert);

    const reaction = HISTORY_REACTIONS[alert.type];
    const callsign = alert.callsigns[0];
    this.after(this.between(reaction.delayS), () => {
      if (this.o.random() < reaction.resolve && this.alerts.resolve(alert.id)) {
        this.resolvedBy.set(alert.id, this.o.controller.id);
      }
      const call = this.lastCall.get(callsign);
      if (reaction.repeat && call) {
        this.after(2 + this.o.random() * 4, () => {
          if (this.simulation.get(callsign)) this.transmit(call);
        });
      }
    });
  }

  /** As SectorRuntime.transmit: parse, put on the frequency, expect a readback, probe, pilot. */
  private transmit(text: string): void {
    const aircraft = this.simulation.getAircraft();
    const clearance = this.o.parser.parseWithRules({
      text,
      speaker: 'atc',
      candidates: aircraft,
      fixes: this.simulation.getFixes().map((f) => f.name),
    });
    this.record(
      {
        id: randomUUID(),
        at: this.nowIso(),
        speaker: 'atc',
        transcript: text,
        clearance,
        audioUrl: null,
        by: this.o.controller.name,
      },
      this.o.controller.id,
    );
    if (!clearance) return;
    this.lastCall.set(clearance.callsign, text);
    this.simulation.touchContact(clearance.callsign);
    this.readbackChecker.expect(clearance, this.simulation.simNowMs());
    const targets = targetsFor(clearance, this.o.sector.airspace);
    const probe = this.probe.probe(clearance.callsign, targets, aircraft);
    for (const conflict of probe.conflicts) this.probe.raise(clearance.callsign, conflict);
    this.pilot.handleInstruction(clearance);
  }

  // --- Clock and recording -----------------------------------------------------------------

  private after(seconds: number, run: () => void | Promise<void>): void {
    this.tasks.push({ atMs: this.simulation.simNowMs() + seconds * 1000, run });
  }

  private async runDue(): Promise<void> {
    const now = this.simulation.simNowMs();
    for (;;) {
      const due = this.tasks.filter((t) => t.atMs <= now).sort((a, b) => a.atMs - b.atMs)[0];
      if (!due) break;
      this.tasks = this.tasks.filter((t) => t !== due);
      // One failed step (as with the live pilot's timers) never ends the session.
      await Promise.resolve()
        .then(due.run)
        .catch(() => undefined);
    }
    // Lets the pilot's own pending steps (unprompted calls) run on this tick.
    await Promise.resolve();
  }

  /** Simulation time -> the past moment it stands for. */
  private toPast(simMs: number): Date {
    return new Date(this.o.startedAt.getTime() + (simMs - this.simStartMs));
  }

  private nowIso(): string {
    return this.toPast(this.simulation.simNowMs()).toISOString();
  }

  private record(payload: CommsPayload, userId: string | null): void {
    payload.at = this.nowIso();
    this.recorded.comms.push({ payload, userId });
  }

  private recordFrame(aircraft: Aircraft[]): void {
    const now = this.simulation.simNowMs();
    if (now - this.lastFrameMs < FRAME_INTERVAL_MS) return;
    this.lastFrameMs = now;
    this.recorded.frames.push({
      at: this.toPast(now),
      aircraft: aircraft.map((a) => ({
        ...a,
        lastContactAt: this.toPast(Date.parse(a.lastContactAt)).toISOString(),
      })),
    });
  }

  // --- Randomness ----------------------------------------------------------------------------

  private between([min, max]: readonly [number, number]): number {
    return min + this.o.random() * (max - min);
  }

  private pickIncident(): Incident {
    const total = INCIDENTS.reduce((n, [, w]) => n + w, 0);
    let r = this.o.random() * total;
    for (const [incident, weight] of INCIDENTS) {
      r -= weight;
      if (r < 0) return incident;
    }
    return INCIDENTS[0][0];
  }

  private shuffle<T>(items: T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.o.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/** A published five-letter name (TITEK), as opposed to a simulated point (CF26, LB08R). */
const SPOKEN_FIX = /^[A-Z]{5}$/;

/** The same kind of mistake on a descent: a wrong heading readback -> a wrong altitude. */
function descentEquivalent(incident: Incident): Incident {
  return 'execution' in incident
    ? { on: 'descend', execution: 'level_bust' }
    : { on: 'descend', readback: 'wrong_altitude' };
}

/** 'WIZZ 44, descend flight level 70' or '..., descend altitude 5000 feet, reduce speed 220'. */
function descendText(a: Aircraft, withSpeed: boolean): string {
  const level = Math.max(3000, Math.floor((a.altitudeFt - 2000) / 1000) * 1000);
  const altitude =
    level > TRANSITION_ALTITUDE_FT
      ? `descend flight level ${level / 100}`
      : `descend altitude ${level} feet`;
  const speed = Math.min(220, roundTo(a.speedKt - 20, 10));
  return withSpeed
    ? `${a.telephony}, ${altitude}, reduce speed ${speed}`
    : `${a.telephony}, ${altitude}`;
}

/** '08R' -> '08 right', as the controller says it. */
function spokenRunway(runway: string): string {
  return runway.replace(/L$/, ' left').replace(/R$/, ' right').replace(/C$/, ' center');
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Heading 0-359 as three digits: 5 -> '005', 360 -> '360'. */
function pad3(heading: number): string {
  const h = ((heading % 360) + 360) % 360 || 360;
  return String(h).padStart(3, '0');
}
