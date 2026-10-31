import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import type {
  Aircraft,
  AircraftDetails,
  Alert,
  CommsReadbackPayload,
  CommsTransmissionPayload,
  CurrentSessionResponse,
  FaultConfig,
  PresenceUser,
  SectorOverview,
  ServerToClientEvents,
  SessionStats,
  TransmissionResponse,
} from '@towerwhisper/shared';
import { randomUUID } from 'node:crypto';
import { NextCallAdvisor } from '../advisor/next-call-advisor';
import { AIRCRAFT_TYPES } from '../airport/constants';
import { assessRunways } from '../airport/runway-advisor';
import type { AppModeService } from '../app-mode.service';
import { DETECTION_WINDOW_S } from '../demo/constants';
import { FaultService, type FaultInjection } from '../demo/fault.service';
import { STT_VOCABULARY } from '../parser/constants';
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
import { ScenarioLoader, type Scenario } from '../session/scenario-loader';
import { SCRIPTED_PHRASES } from '../session/constants';
import { AircraftKinematics } from '../simulation/aircraft-kinematics';
import { SimulationService } from '../simulation/simulation.service';
import type { TtsService } from '../voice/tts.service';
import { WeatherService } from '../weather/weather.service';
import { generateArrivals } from './arrivals';
import {
  COMMS_HISTORY_SIZE,
  FRAME_FLUSH_MS,
  FRAME_INTERVAL_MS,
  TRANSITION_ALTITUDE_FT,
} from './constants';
import type { Sector } from './sectors';
import type { SessionStore } from './session-store';

/** Services shared by every sector (stateless or global). */
export interface RuntimeDeps {
  parser: ParserService;
  tts: TtsService;
  store: SessionStore;
  appMode: AppModeService;
  commsLimits: FaultConfig['commsLimits'];
  parserAccuracy: () => number | null;
}

/** Sends one event to every screen following this sector (set by the realtime gateway). */
export type SectorEmitter = <E extends keyof ServerToClientEvents>(
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) => void;

type CommsPayload = CommsTransmissionPayload | CommsReadbackPayload;

interface TrackedInjection extends FaultInjection {
  atMs: number;
  detectedAfterS: number | null;
}

/** Who sent a controller transmission, and its recording. */
export interface TransmissionMeta {
  id?: string;
  userId: string | null;
  userName: string | null;
  audioUrl: string | null;
  sttLatencyMs: number | null;
}

/**
 * One sector's live session: its own simulation, safety checks, simulated pilots, demo
 * faults, weather, comms history and recording. Every sector runs one, side by side; the
 * realtime gateway routes each screen to the sector it follows.
 */
export class SectorRuntime {
  readonly simulation: SimulationService;
  readonly alerts = new AlertRegistry();
  readonly readbackChecker: ReadbackChecker;
  readonly conformance: ConformanceMonitor;
  readonly probe: ClearanceProbe;
  readonly faults: FaultService;
  readonly pilot: PilotService;
  readonly weather: WeatherService;

  private readonly logger: Logger;
  private emitter: SectorEmitter | null = null;
  private sessionId = randomUUID();
  private startedAt = new Date();
  private history: CommsPayload[] = [];
  private phrases: string[] = [];
  private injections: TrackedInjection[] = [];
  private sttLatencies: number[] = [];
  /** Alerts resolved this session: raise -> resolution time, for the dashboard. */
  private resolveTimes: number[] = [];
  private sessionAlertIds = new Set<string>();
  /** Who resolved an alert, until its end is written. */
  private readonly resolvedBy = new Map<string, string>();
  private readonly pttHolders = new Set<string>();
  private readonly alertListeners: (() => void)[] = [];
  private frames: { sessionId: string; at: Date; aircraft: Aircraft[] }[] = [];
  private readonly advisor: NextCallAdvisor;
  /** When the controller last called each aircraft (sim ms): no advice right after it. */
  private readonly lastAtcAt = new Map<string, number>();
  private lastFrameAt = 0;
  private flushTimer?: NodeJS.Timeout;

  constructor(
    readonly sector: Sector,
    private readonly deps: RuntimeDeps,
  ) {
    const airspace = sector.airspace;
    this.logger = new Logger(`Sector ${sector.definition.id}`);
    this.simulation = new SimulationService(new AircraftKinematics(airspace));
    this.readbackChecker = new ReadbackChecker(this.alerts);
    this.conformance = new ConformanceMonitor(this.alerts);
    this.probe = new ClearanceProbe(this.alerts, airspace.airport.lat);
    this.faults = new FaultService(deps.commsLimits, this.simulation);
    this.pilot = new PilotService(
      new ReadbackBuilder(airspace),
      deps.parser,
      deps.tts,
      this.simulation,
      this.faults,
      this.readbackChecker,
      this.conformance,
      (payload) => this.broadcastComms(payload),
      sector.definition.towerCallsign,
    );
    new SafetyMonitorService(
      this.simulation,
      this.faults,
      this.readbackChecker,
      this.conformance,
      new CommsWatchdog(this.alerts),
      this.probe,
    );
    this.weather = new WeatherService(airspace);
    this.advisor = new NextCallAdvisor(airspace);

    this.simulation.onTick((aircraft, simNowMs) => {
      const traffic = this.withAdvice(aircraft, simNowMs);
      this.emit('traffic:update', traffic);
      this.recordFrame(traffic);
    });
    this.alerts.subscribe({
      raised: (alert) => this.onAlertRaised(alert),
      cleared: (alert, reason) => this.onAlertEnded(alert, reason),
    });
    this.faults.onChange((config) => this.emit('demo:faults', config));
    this.faults.onOverlay((visible) => this.emit('stats:overlay', { visible }));
    this.faults.onInjected((injection) => this.onInjected(injection));
    this.weather.onUpdate((w) => this.emit('weather:update', w));
  }

  get id(): string {
    return this.sector.definition.id;
  }

  get session(): { id: string; startedAt: string } {
    return { id: this.sessionId, startedAt: this.startedAt.toISOString() };
  }

  setEmitter(emitter: SectorEmitter): void {
    this.emitter = emitter;
  }

  /** Called whenever the sector's active alerts change (supervisor dashboard). */
  onAlertsChanged(listener: () => void): void {
    this.alertListeners.push(listener);
  }

  async start(): Promise<void> {
    await this.newSession();
    this.simulation.start();
    this.weather.start();
    this.flushTimer = setInterval(() => void this.flushFrames(), FRAME_FLUSH_MS);
  }

  async stop(): Promise<void> {
    this.simulation.stop();
    this.weather.stop();
    this.pilot.cancelAll();
    clearInterval(this.flushTimer);
    await this.flushFrames();
    await this.deps.store.endSession(this.sessionId);
  }

  /** Restarts the scenario from zero (demo panel); returns the new session id. */
  async reset(sessionId?: string): Promise<string> {
    if (sessionId && sessionId !== this.sessionId) {
      throw new NotFoundException('Not the active session');
    }
    await this.flushFrames();
    await this.deps.store.endSession(this.sessionId);
    await this.newSession();
    return this.sessionId;
  }

  current(): CurrentSessionResponse {
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt.toISOString(),
      mode: this.deps.appMode.mode,
      stt: this.deps.appMode.stt,
      scriptedPhrases: this.phrases,
    };
  }

  stats(sessionId: string): SessionStats {
    if (sessionId !== this.sessionId) throw new NotFoundException('Not the active session');
    const detected = this.injections.filter((i) => i.detectedAfterS !== null);
    return {
      faultsInjected: this.injections.length,
      faultsDetected: detected.length,
      meanDetectionS: mean(detected.map((i) => i.detectedAfterS!)),
      meanSttLatencyMs: mean(this.sttLatencies),
      parserAccuracy: this.deps.parserAccuracy(),
    };
  }

  /** POST /alerts/:id/resolve, by the sector's controller. */
  resolveAlert(alertId: string, userId: string | null): { id: string; resolvedAt: string } {
    const active = this.alerts.list().find((a) => a.id === alertId);
    if (!active) throw new NotFoundException('No active alert with this id');
    if (userId) this.resolvedBy.set(alertId, userId);
    const alert = this.alerts.resolve(alertId)!;
    return { id: alert.id, resolvedAt: alert.endedAt! };
  }

  /**
   * One controller transmission (spec section 6): parse -> comms:transmission +
   * clearance:issued -> readback expected, clearance probed -> the pilot answers.
   */
  async transmit(
    text: string,
    selectedCallsign: string | undefined,
    meta: TransmissionMeta,
  ): Promise<TransmissionResponse> {
    if (typeof text !== 'string' || !text.trim())
      throw new BadRequestException('Empty transmission');
    const transcript = text.trim();
    const id = meta.id ?? randomUUID();
    if (meta.sttLatencyMs !== null) this.sttLatencies.push(meta.sttLatencyMs);

    const aircraft = this.simulation.getAircraft();
    const clearance = await this.deps.parser.parse({
      text: transcript,
      speaker: 'atc',
      candidates: aircraft,
      selectedCallsign: selectedCallsign || null,
      fixes: this.simulation.getFixes().map((f) => f.name),
    });

    this.broadcastComms(
      {
        id,
        at: new Date().toISOString(),
        speaker: 'atc',
        transcript,
        clearance,
        audioUrl: meta.audioUrl,
        by: meta.userName,
      },
      meta,
    );
    if (!clearance) {
      this.logger.log(`Unparsed transmission: "${transcript}"`);
      return { transmissionId: id, transcript, clearance: null };
    }

    this.simulation.touchContact(clearance.callsign);
    this.lastAtcAt.set(clearance.callsign, this.simulation.simNowMs());
    this.readbackChecker.expect(clearance, this.simulation.simNowMs());

    // Clearance Probe: what this instruction would do to separation, before it is flown.
    const targets = targetsFor(clearance, this.sector.airspace);
    const probe = this.probe.probe(clearance.callsign, targets, aircraft);
    this.emit('probe:result', probe);
    for (const conflict of probe.conflicts) this.probe.raise(clearance.callsign, conflict);

    this.pilot.handleInstruction(clearance);
    return { transmissionId: id, transcript, clearance };
  }

  /**
   * ATC vocabulary, the fixes in use and "TAROM 301, WIZZ 44, ...", so Whisper spells terms,
   * fixes and callsigns right. Whisper keeps only the last ~224 tokens of a prompt: the
   * airspace has nearly 200 published points, so only the approach fixes and those on the
   * flight plans of the traffic go in, and the callsigns come last, where nothing cuts them.
   * Names are written "Tarom 301", "Ozzet": a prompt in capitals makes Whisper answer in
   * capitals and abbreviate ("DESCEND ALT"); the parser ignores case anyway.
   */
  vocabularyPrompt(): string {
    const aircraft = this.simulation.getAircraft();
    const fixes = new Set(this.sector.airspace.fixes.filter((f) => f.role).map((f) => f.name));
    for (const a of aircraft) {
      for (const w of this.simulation.getFlightPlan(a.callsign)?.route ?? []) fixes.add(w.name);
    }
    const callsigns = aircraft.map((a) => a.telephony);
    const names = (list: string[]) => list.map(capitalized).join(', ');
    return `${STT_VOCABULARY}, direct ${names([...fixes])}. ${names(callsigns)}.`;
  }

  /** GET /aircraft/:callsign — type data, flight plan and runway compatibility. */
  aircraftDetails(callsign: string): AircraftDetails {
    const a = this.simulation.get(callsign);
    if (!a) throw new NotFoundException(`${callsign} is not on the scope`);
    const type = AIRCRAFT_TYPES[a.type] ?? null;
    const flightPlan = this.simulation.getFlightPlan(callsign) ?? null;
    const weather = this.weather.get();
    const weight = flightPlan?.declaredLandingWeightKg ?? type?.mlwKg;
    return {
      callsign: a.callsign,
      telephony: a.telephony,
      type,
      flightPlan,
      remainingRoute: this.simulation.getRemainingRoute(callsign),
      runways: type && weight ? assessRunways(type, weight, weather, this.sector.airspace) : [],
      weatherBasis: weather ? 'live' : 'none',
    };
  }

  // --- Screens ---------------------------------------------------------------------------

  /** Everything a screen needs when it starts following this sector. */
  sendInitialState(send: SectorEmitter, access: 'control' | 'view'): void {
    send('sector:joined', {
      sector: this.sector.info,
      sessionId: this.sessionId,
      startedAt: this.startedAt.toISOString(),
      access,
    });
    send('demo:faults', this.faults.getConfig());
    send('frequency:busy', { busy: this.pttHolders.size > 0 });
    send('stats:overlay', { visible: this.faults.isOverlayVisible() });
    const weather = this.weather.get();
    if (weather) send('weather:update', weather);
    send(
      'traffic:update',
      this.withAdvice(this.simulation.getAircraft(), this.simulation.simNowMs()),
    );
    send('comms:history', this.history);
    send('alert:history', this.alerts.history());
    for (const alert of this.alerts.list()) send('alert:raised', alert);
  }

  setPtt(socketId: string, on: boolean): void {
    const before = this.pttHolders.size > 0;
    if (on) this.pttHolders.add(socketId);
    else this.pttHolders.delete(socketId);
    const busy = this.pttHolders.size > 0;
    if (busy !== before) this.emit('frequency:busy', { busy });
  }

  overview(controllers: PresenceUser[], viewers: number): SectorOverview {
    return {
      sector: this.sector.info,
      sessionId: this.sessionId,
      startedAt: this.startedAt.toISOString(),
      aircraftCount: this.simulation.getAircraft().length,
      activeAlerts: this.alerts.list(),
      controllers,
      viewers,
      sessionAlerts: this.sessionAlertIds.size,
      sessionResolved: this.resolveTimes.length,
      meanResolveS: mean(this.resolveTimes),
    };
  }

  // --- Internals -------------------------------------------------------------------------

  private async newSession(): Promise<void> {
    this.pilot.cancelAll();
    this.alerts.reset();
    this.readbackChecker.reset();
    this.conformance.reset();
    this.faults.resetForNewSession();
    const scenario = this.loadScenario();
    this.simulation.load(scenario.aircraft, scenario.fixes);
    this.phrases = this.scriptedPhrases(scenario);
    this.injections = [];
    this.sttLatencies = [];
    this.resolveTimes = [];
    this.sessionAlertIds = new Set();
    this.history = [];
    this.pttHolders.clear();
    this.lastAtcAt.clear();
    this.frames = [];
    this.lastFrameAt = 0;

    this.sessionId = randomUUID();
    this.startedAt = new Date();
    await this.deps.store.startSession(this.sessionId, this.id, scenario.name, this.startedAt);
    this.emit('session:reset', {
      sessionId: this.sessionId,
      startedAt: this.startedAt.toISOString(),
    });
    this.notifyAlerts();
    this.logger.log(`Session ${this.sessionId} started (${scenario.aircraft.length} aircraft)`);
  }

  private loadScenario(): Scenario {
    const { definition, airspace } = this.sector;
    return definition.scenario
      ? new ScenarioLoader().load(definition.scenario, airspace)
      : generateArrivals(definition.id, airspace);
  }

  /** Craiova has its scripted demo phrases; other sectors get some built from their arrivals. */
  private scriptedPhrases(scenario: Scenario): string[] {
    if (this.sector.definition.scenario) return SCRIPTED_PHRASES;
    const rwy = this.sector.airspace.ilsRunway;
    const spoken = rwy.replace(/L$/, ' left').replace(/R$/, ' right').replace(/C$/, ' center');
    return scenario.aircraft.flatMap((a, i) => {
      const level = Math.max(4000, Math.floor((a.altitudeFt - 2000) / 1000) * 1000);
      const phrases = [
        level > TRANSITION_ALTITUDE_FT
          ? `${a.telephony}, descend flight level ${level / 100}`
          : `${a.telephony}, descend altitude ${level} feet`,
      ];
      if (i < 2) phrases.push(`${a.telephony}, cleared ILS approach runway ${spoken}`);
      if (i === 0) phrases.push(`${a.telephony}, cleared to land runway ${spoken}`);
      return phrases;
    });
  }

  /** The suggested next call on every aircraft (advisor/), for the scope and the replay. */
  private withAdvice(aircraft: Aircraft[], simNowMs: number): Aircraft[] {
    const weather = this.weather.get();
    return aircraft.map((a) => {
      const last = this.lastAtcAt.get(a.callsign);
      const advisory = this.advisor.advise(a, {
        flightPlan: this.simulation.getFlightPlan(a.callsign),
        remainingRoute: this.simulation.getRemainingRoute(a.callsign),
        weather,
        sinceAtcMs: last === undefined ? null : simNowMs - last,
      });
      return advisory ? { ...a, advisory } : a;
    });
  }

  private emit: SectorEmitter = (event, ...args) => {
    this.emitter?.(event, ...args);
  };

  private broadcastComms(
    payload: CommsPayload,
    meta: Pick<TransmissionMeta, 'userId' | 'sttLatencyMs'> = { userId: null, sttLatencyMs: null },
  ): void {
    this.history = [...this.history, payload].slice(-COMMS_HISTORY_SIZE);
    if (payload.speaker === 'atc') {
      this.emit('comms:transmission', payload);
      if (payload.clearance) this.emit('clearance:issued', payload.clearance);
    } else {
      this.emit('comms:readback', payload);
    }
    void this.deps.store.comms(this.sessionId, payload, meta);
  }

  private onAlertRaised(alert: Alert): void {
    this.emit('alert:raised', alert);
    this.sessionAlertIds.add(alert.id);
    // The first matching alert after an injection proves that it was detected.
    const now = Date.now();
    const match = this.injections.find(
      (i) =>
        i.detectedAfterS === null &&
        i.expected.includes(alert.type) &&
        alert.callsigns.includes(i.callsign) &&
        now - i.atMs <= DETECTION_WINDOW_S * 1000,
    );
    if (match) match.detectedAfterS = (now - match.atMs) / 1000;
    void this.deps.store.alertRaised(this.sessionId, alert);
    this.notifyAlerts();
  }

  private onAlertEnded(alert: Alert, reason: string): void {
    this.emit('alert:cleared', {
      id: alert.id,
      reason,
      outcome: alert.outcome ?? 'cleared',
      at: alert.endedAt ?? new Date().toISOString(),
    });
    if (alert.outcome === 'resolved' && alert.endedAt) {
      this.resolveTimes.push((Date.parse(alert.endedAt) - Date.parse(alert.raisedAt)) / 1000);
    }
    const by = this.resolvedBy.get(alert.id) ?? null;
    this.resolvedBy.delete(alert.id);
    void this.deps.store.alertEnded(alert, by);
    this.notifyAlerts();
  }

  private onInjected(injection: FaultInjection): void {
    this.injections.push({ ...injection, atMs: Date.now(), detectedAfterS: null });
    void this.deps.store.faultInjected(this.sessionId, injection);
  }

  private notifyAlerts(): void {
    for (const l of this.alertListeners) l();
  }

  /** A radar picture every FRAME_INTERVAL_MS for the replay, written in batches. */
  private recordFrame(aircraft: Aircraft[]): void {
    const now = Date.now();
    if (now - this.lastFrameAt < FRAME_INTERVAL_MS) return;
    this.lastFrameAt = now;
    this.frames.push({ sessionId: this.sessionId, at: new Date(now), aircraft });
  }

  private async flushFrames(): Promise<void> {
    const batch = this.frames;
    this.frames = [];
    await this.deps.store.saveFrames(batch);
  }
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

/** 'TAROM 301' -> 'Tarom 301', 'OZZET' -> 'Ozzet'; words with digits ('2RP') stay as they are. */
function capitalized(name: string): string {
  return name.replace(/\b([A-Z])([A-Z]+)\b/g, (_, first: string, rest: string) => first + rest.toLowerCase());
}
