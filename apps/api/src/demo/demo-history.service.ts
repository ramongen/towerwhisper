import { Injectable, Logger, type LogLevel, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Clearance } from '@towerwhisper/shared';
import { createHash, randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { DEFAULT_PASSWORD } from '../auth/constants';
import { hashPassword } from '../auth/password';
import {
  AlertEntity,
  ClearanceEntity,
  SessionEntity,
  TrafficFrameEntity,
  TransmissionEntity,
  UserEntity,
} from '../database/entities';
import { ParserService } from '../parser/parser.service';
import { DEFAULT_COMMS_CAUTION_MIN, DEFAULT_COMMS_WARNING_MIN } from '../safety/constants';
import { SECTORS, type Sector } from '../sectors/sectors';
import {
  HISTORY_CONTROLLERS,
  HISTORY_FRAME_BATCH,
  HISTORY_RADAR_SESSIONS,
  HISTORY_SCENARIO,
  HISTORY_SECTOR_JITTER_H,
  HISTORY_SESSIONS,
  HISTORY_STALE_AFTER_H,
} from './constants';
import { HistorySession, type HistoryController, type RecordedSession } from './history-session';

/** Log levels while the history runs (thousands of headless "landed" lines otherwise). */
const QUIET: LogLevel[] = ['error', 'warn'];
const NORMAL: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'];

/**
 * Fills the supervisor dashboard with past sessions of every generated sector (all but
 * Craiova, which keeps only what is really done in it): alerts for the statistics, and
 * comms, alerts and radar to replay. Runs in the background after startup and only when the
 * seeded history is missing or stale; DEMO_HISTORY=false turns it off. The sessions are
 * recorded by HistorySession with the real simulation and safety checks.
 */
@Injectable()
export class DemoHistoryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoHistoryService.name);
  private readonly enabled: boolean;
  private readonly commsLimits: { cautionS: number; warningS: number };

  constructor(
    config: ConfigService,
    private readonly parser: ParserService,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(TransmissionEntity)
    private readonly transmissions: Repository<TransmissionEntity>,
    @InjectRepository(ClearanceEntity) private readonly clearances: Repository<ClearanceEntity>,
    @InjectRepository(AlertEntity) private readonly alerts: Repository<AlertEntity>,
    @InjectRepository(TrafficFrameEntity) private readonly frames: Repository<TrafficFrameEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  ) {
    this.enabled = config.get<string>('DEMO_HISTORY')?.trim().toLowerCase() !== 'false';
    const cautionMin = Number(config.get('COMMS_CAUTION_MIN') ?? DEFAULT_COMMS_CAUTION_MIN);
    const warningMin = Number(config.get('COMMS_WARNING_MIN') ?? DEFAULT_COMMS_WARNING_MIN);
    this.commsLimits = { cautionS: cautionMin * 60, warningS: warningMin * 60 };
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Demo history off (DEMO_HISTORY=false)');
      return;
    }
    void this.refresh();
  }

  /** Never throws: without a history the dashboard simply shows what was really recorded. */
  async refresh(): Promise<void> {
    try {
      const last = await this.sessions
        .createQueryBuilder('s')
        .select('MAX(s.ended_at)', 'last')
        .where('s.scenario = :scenario', { scenario: HISTORY_SCENARIO })
        .getRawOne<{ last: Date | null }>();
      const ageH = last?.last ? (Date.now() - new Date(last.last).getTime()) / 3.6e6 : Infinity;
      if (ageH < HISTORY_STALE_AFTER_H) {
        this.logger.log('Demo history is up to date');
        return;
      }
      await this.seed();
    } catch (error) {
      Logger.overrideLogger(NORMAL);
      this.logger.warn(`Demo history not written: ${(error as Error).message}`);
    }
  }

  private async seed(): Promise<void> {
    const started = Date.now();
    // The previous history goes (with its comms, alerts and radar: ON DELETE CASCADE).
    await this.sessions.delete({ scenario: HISTORY_SCENARIO });
    const sectors = SECTORS.filter(
      (s) => !s.definition.scenario && HISTORY_CONTROLLERS[s.definition.id],
    );
    let sessions = 0;
    let alerts = 0;

    Logger.overrideLogger(QUIET);
    for (const sector of sectors) {
      const controller = await this.controllerFor(sector);
      const random = seededRandom(`${sector.definition.id}:${new Date().toDateString()}`);
      for (const [i, [endedHoursAgo, minutes]] of HISTORY_SESSIONS.entries()) {
        const jitterH = random() * Math.min(HISTORY_SECTOR_JITTER_H, endedHoursAgo / 4);
        const endedAt = Date.now() - (endedHoursAgo + jitterH) * 3.6e6;
        const recorded = await new HistorySession({
          sector,
          parser: this.parser,
          controller,
          commsLimits: this.commsLimits,
          startedAt: new Date(endedAt - minutes * 60_000),
          minutes,
          recordRadar: i < HISTORY_RADAR_SESSIONS,
          random,
        }).run();
        await this.write(sector, recorded);
        sessions++;
        alerts += recorded.alerts.length;
      }
    }
    Logger.overrideLogger(NORMAL);
    this.logger.log(
      `Demo history: ${sessions} past sessions, ${alerts} alerts in ${sectors.length} sectors ` +
        `(${((Date.now() - started) / 1000).toFixed(1)} s)`,
    );
  }

  /** The sector's controller account, created with the history if it does not exist. */
  private async controllerFor(sector: Sector): Promise<HistoryController> {
    const seed = HISTORY_CONTROLLERS[sector.definition.id];
    const existing = await this.users.findOneBy({ email: seed.email });
    if (existing) return { id: existing.id, name: existing.name };
    const id = randomUUID();
    await this.users.insert({
      id,
      email: seed.email,
      name: seed.name,
      role: 'atc',
      sectorId: sector.definition.id,
      passwordHash: await hashPassword(DEFAULT_PASSWORD),
      lastLoginAt: null,
    });
    return { id, name: seed.name };
  }

  /** The same rows SessionStore writes for a live session, with the recorded timestamps. */
  private async write(sector: Sector, s: RecordedSession): Promise<void> {
    const sessionId = randomUUID();
    await this.sessions.insert({
      id: sessionId,
      sectorId: sector.definition.id,
      scenario: HISTORY_SCENARIO,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    });
    if (s.comms.length) {
      await this.transmissions.insert(
        s.comms.map(({ payload, userId }) => ({
          id: payload.id,
          sessionId,
          speaker: payload.speaker,
          audioPath: null,
          transcript: payload.transcript,
          callsign:
            payload.speaker === 'pilot' ? payload.callsign : (payload.clearance?.callsign ?? null),
          userId,
          payload: payload as unknown as Record<string, unknown>,
          sttLatencyMs: null,
          createdAt: new Date(payload.at),
        })) as QueryDeepPartialEntity<TransmissionEntity>[], // jsonb payload
      );
      const clearances = s.comms
        .filter((c): c is typeof c & { payload: { clearance: Clearance } } => !!c.payload.clearance)
        .map(({ payload }) => ({
          id: payload.clearance.id,
          transmissionId: payload.id,
          callsign: payload.clearance.callsign,
          payload: payload.clearance,
          parsePath: payload.clearance.parsePath,
          confidence: payload.clearance.confidence,
        }));
      if (clearances.length) await this.clearances.insert(clearances);
    }
    if (s.alerts.length) {
      await this.alerts.insert(
        s.alerts.map(({ alert, resolvedBy }) => ({
          id: alert.id,
          sessionId,
          type: alert.type,
          severity: alert.severity,
          callsigns: alert.callsigns,
          message: alert.message,
          details: alert.details,
          raisedAt: new Date(alert.raisedAt),
          endedAt: alert.endedAt ? new Date(alert.endedAt) : s.endedAt,
          outcome: alert.outcome ?? 'cleared',
          endReason: alert.endReason ?? null,
          resolvedBy,
        })) as QueryDeepPartialEntity<AlertEntity>[], // jsonb details
      );
    }
    for (let i = 0; i < s.frames.length; i += HISTORY_FRAME_BATCH) {
      await this.frames.insert(
        s.frames.slice(i, i + HISTORY_FRAME_BATCH).map((f) => ({ sessionId, ...f })),
      );
    }
  }
}

/** Deterministic random numbers in [0, 1) from a text seed (mulberry32). */
export function seededRandom(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
