import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Alert, Clearance, CurrentSessionResponse, SessionStats } from '@towerwhisper/shared';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repository } from 'typeorm';
import { AppModeService } from '../app-mode.service';
import {
  AlertEntity,
  ClearanceEntity,
  FaultEventEntity,
  SessionEntity,
  TransmissionEntity,
} from '../database/entities';
import { DETECTION_WINDOW_S } from '../demo/constants';
import { FaultService, type FaultInjection } from '../demo/fault.service';
import { measureParserAccuracy, type PhraseCase } from '../parser/parser-accuracy';
import { ParserService } from '../parser/parser.service';
import { PilotService } from '../pilot/pilot.service';
import { RealtimeGateway, type CommsEvent } from '../realtime/realtime.gateway';
import { AlertRegistry } from '../safety/alert-registry';
import { ConformanceMonitor } from '../safety/conformance-monitor';
import { ReadbackChecker } from '../safety/readback-checker';
import { SimulationService } from '../simulation/simulation.service';
import { DEFAULT_SCENARIO, SCRIPTED_PHRASES } from './constants';
import { ScenarioLoader } from './scenario-loader';

const PHRASES_FILE = join(__dirname, '..', '..', 'test', 'phrases.json');

interface TrackedInjection extends FaultInjection {
  atMs: number;
  detectedAfterS: number | null;
}

/**
 * Starts, resets and persists a demo session. Live state stays in memory; Postgres keeps
 * transmissions, clearances, alerts and fault events for replay and statistics. A failing
 * database never stops the demo: writes are logged and skipped.
 */
@Injectable()
export class SessionService implements OnModuleInit {
  private readonly logger = new Logger(SessionService.name);
  private sessionId = randomUUID();
  private startedAt = new Date();
  private injections: TrackedInjection[] = [];
  private sttLatencies: number[] = [];
  private parserAccuracy: number | null = null;
  private readonly pttMeta = new Map<
    string,
    { audioPath: string | null; sttLatencyMs: number | null }
  >();

  constructor(
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(TransmissionEntity)
    private readonly transmissions: Repository<TransmissionEntity>,
    @InjectRepository(ClearanceEntity) private readonly clearances: Repository<ClearanceEntity>,
    @InjectRepository(AlertEntity) private readonly alertRows: Repository<AlertEntity>,
    @InjectRepository(FaultEventEntity) private readonly faultEvents: Repository<FaultEventEntity>,
    private readonly scenarios: ScenarioLoader,
    private readonly simulation: SimulationService,
    private readonly alerts: AlertRegistry,
    private readonly readbackChecker: ReadbackChecker,
    private readonly conformance: ConformanceMonitor,
    private readonly faults: FaultService,
    private readonly pilot: PilotService,
    private readonly realtime: RealtimeGateway,
    private readonly parser: ParserService,
    private readonly appMode: AppModeService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.parserAccuracy = this.measureParser();
    this.alerts.subscribe({
      raised: (alert) => this.onAlertRaised(alert),
      cleared: () => undefined,
    });
    this.faults.onInjected((injection) => this.onInjected(injection));
    this.realtime.onComms((event) => void this.persistComms(event));
    await this.start(DEFAULT_SCENARIO);
  }

  current(): CurrentSessionResponse {
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt.toISOString(),
      mode: this.appMode.mode,
      stt: this.appMode.stt,
      scriptedPhrases: SCRIPTED_PHRASES,
    };
  }

  get id(): string {
    return this.sessionId;
  }

  /** POST /sessions — a fresh session with the scenario loaded from zero. */
  async create(scenario: string): Promise<string> {
    await this.start(scenario);
    return this.sessionId;
  }

  /** POST /sessions/:id/reset — restarts the scenario; returns the new session id. */
  async reset(sessionId: string): Promise<string> {
    if (sessionId !== this.sessionId) throw new NotFoundException('Not the active session');
    await this.persist(() => this.sessions.update(sessionId, { endedAt: new Date() }));
    await this.start(DEFAULT_SCENARIO);
    return this.sessionId;
  }

  stats(sessionId: string): SessionStats {
    if (sessionId !== this.sessionId) throw new NotFoundException('Not the active session');
    const detected = this.injections.filter((i) => i.detectedAfterS !== null);
    return {
      faultsInjected: this.injections.length,
      faultsDetected: detected.length,
      meanDetectionS: mean(detected.map((i) => i.detectedAfterS!)),
      meanSttLatencyMs: mean(this.sttLatencies),
      parserAccuracy: this.parserAccuracy,
    };
  }

  /** POST /alerts/:id/ack */
  async acknowledge(alertId: string): Promise<{ id: string; acknowledgedAt: string }> {
    const alert = this.alerts.acknowledge(alertId);
    if (!alert) throw new NotFoundException('No active alert with this id');
    await this.persist(() =>
      this.alertRows.update(alertId, { acknowledgedAt: new Date(alert.acknowledgedAt!) }),
    );
    return { id: alert.id, acknowledgedAt: alert.acknowledgedAt! };
  }

  /**
   * Called by the transmission pipeline before broadcasting a PTT transmission, so the
   * stored row keeps its recorded audio and STT latency.
   */
  attachAudio(transmissionId: string, audioPath: string | null, sttLatencyMs: number | null): void {
    this.pttMeta.set(transmissionId, { audioPath, sttLatencyMs });
    if (sttLatencyMs !== null) this.sttLatencies.push(sttLatencyMs);
  }

  private async start(scenario: string): Promise<void> {
    this.pilot.cancelAll();
    this.alerts.reset();
    this.readbackChecker.reset();
    this.conformance.reset();
    this.faults.resetForNewSession();
    const loaded = this.scenarios.load(scenario);
    this.simulation.load(loaded.aircraft, loaded.fixes);
    this.injections = [];
    this.sttLatencies = [];

    this.sessionId = randomUUID();
    this.startedAt = new Date();
    await this.persist(() =>
      this.sessions.insert({
        id: this.sessionId,
        scenario,
        startedAt: this.startedAt,
        endedAt: null,
      }),
    );
    this.realtime.sessionReset({
      sessionId: this.sessionId,
      startedAt: this.startedAt.toISOString(),
    });
  }

  private onInjected(injection: FaultInjection): void {
    this.injections.push({ ...injection, atMs: Date.now(), detectedAfterS: null });
    const sessionId = this.sessionId;
    void this.persist(() =>
      this.faultEvents.save(
        this.faultEvents.create({
          sessionId,
          faultType: injection.kind,
          callsign: injection.callsign,
          config: injection.config,
          triggeredAt: new Date(),
        }),
      ),
    );
  }

  private onAlertRaised(alert: Alert): void {
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

    const sessionId = this.sessionId;
    void this.persist(() =>
      this.alertRows.save({
        id: alert.id,
        sessionId,
        type: alert.type,
        severity: alert.severity,
        callsigns: alert.callsigns,
        message: alert.message,
        details: alert.details,
        raisedAt: new Date(alert.raisedAt),
        acknowledgedAt: alert.acknowledgedAt ? new Date(alert.acknowledgedAt) : null,
      }),
    );
  }

  private async persistComms(event: CommsEvent): Promise<void> {
    const sessionId = this.sessionId;
    const { payload } = event;
    const meta = this.pttMeta.get(payload.id);
    this.pttMeta.delete(payload.id);
    await this.persist(async () => {
      await this.transmissions.insert({
        id: payload.id,
        sessionId,
        speaker: payload.speaker,
        audioPath: event.kind === 'readback' ? event.payload.audioUrl : (meta?.audioPath ?? null),
        transcript: payload.transcript,
        sttLatencyMs: meta?.sttLatencyMs ?? null,
      });
      if (payload.clearance) await this.saveClearance(payload.id, payload.clearance);
    });
  }

  private async saveClearance(transmissionId: string, c: Clearance): Promise<void> {
    await this.clearances.insert({
      id: c.id,
      transmissionId,
      callsign: c.callsign,
      payload: c,
      parsePath: c.parsePath,
      confidence: c.confidence,
    });
  }

  private measureParser(): number | null {
    try {
      const phrases = JSON.parse(readFileSync(PHRASES_FILE, 'utf-8')) as PhraseCase[];
      const scenario = this.scenarios.load(DEFAULT_SCENARIO);
      const report = measureParserAccuracy(
        this.parser,
        phrases,
        scenario.aircraft,
        scenario.fixes.map((f) => f.name),
      );
      this.logger.log(
        `Parser accuracy on ${phrases.length} test phrases: ${(report.accuracy * 100).toFixed(1)}%`,
      );
      return report.accuracy;
    } catch (error) {
      this.logger.warn(`Parser accuracy not measured: ${(error as Error).message}`);
      return null;
    }
  }

  private async persist(write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (error) {
      this.logger.warn(`Database write skipped: ${(error as Error).message}`);
    }
  }
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}
