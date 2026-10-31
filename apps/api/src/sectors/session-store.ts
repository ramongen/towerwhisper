import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  Aircraft,
  Alert,
  Clearance,
  CommsReadbackPayload,
  CommsTransmissionPayload,
} from '@towerwhisper/shared';
import type { Repository } from 'typeorm';
import {
  AlertEntity,
  ClearanceEntity,
  FaultEventEntity,
  SessionEntity,
  TrafficFrameEntity,
  TransmissionEntity,
} from '../database/entities';
import type { FaultInjection } from '../demo/fault.service';

const SESSION_ENDED = 'session ended';

/**
 * Postgres writes for every sector session: the session, its transmissions and clearances,
 * alerts, fault events and recorded radar frames (replay and supervisor statistics).
 * A failing database never stops a sector: writes are logged and skipped.
 */
@Injectable()
export class SessionStore {
  private readonly logger = new Logger(SessionStore.name);

  constructor(
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(TransmissionEntity)
    private readonly transmissions: Repository<TransmissionEntity>,
    @InjectRepository(ClearanceEntity) private readonly clearances: Repository<ClearanceEntity>,
    @InjectRepository(AlertEntity) private readonly alerts: Repository<AlertEntity>,
    @InjectRepository(FaultEventEntity) private readonly faultEvents: Repository<FaultEventEntity>,
    @InjectRepository(TrafficFrameEntity) private readonly frames: Repository<TrafficFrameEntity>,
  ) {}

  startSession(id: string, sectorId: string, scenario: string, startedAt: Date): Promise<void> {
    return this.persist(() =>
      this.sessions.insert({ id, sectorId, scenario, startedAt, endedAt: null }),
    );
  }

  /** The session ended: so did the alerts still open in it. */
  async endSession(id: string): Promise<void> {
    await this.persist(() => this.sessions.update(id, { endedAt: new Date() }));
    await this.persist(() =>
      this.alerts
        .createQueryBuilder()
        .update()
        .set({ endedAt: () => 'now()', outcome: 'cleared', endReason: SESSION_ENDED })
        .where('session_id = :id AND ended_at IS NULL', { id })
        .execute(),
    );
  }

  /**
   * On startup: sessions left open by a previous run ended when it stopped (at their last
   * radar frame), and so did their open alerts.
   */
  async closeOpenSessions(): Promise<void> {
    await this.persist(() =>
      this.sessions
        .createQueryBuilder()
        .update()
        .set({
          endedAt: () =>
            `COALESCE((SELECT MAX(f.at) FROM traffic_frames f WHERE f.session_id = sessions.id), started_at)`,
        })
        .where('ended_at IS NULL')
        .execute(),
    );
    await this.persist(() =>
      this.alerts
        .createQueryBuilder()
        .update()
        .set({
          endedAt: () => `(SELECT s.ended_at FROM sessions s WHERE s.id = alerts.session_id)`,
          outcome: 'cleared',
          endReason: SESSION_ENDED,
        })
        .where('ended_at IS NULL')
        .execute(),
    );
  }

  alertRaised(sessionId: string, alert: Alert): Promise<void> {
    return this.persist(() =>
      this.alerts.save({
        id: alert.id,
        sessionId,
        type: alert.type,
        severity: alert.severity,
        callsigns: alert.callsigns,
        message: alert.message,
        details: alert.details,
        raisedAt: new Date(alert.raisedAt),
        endedAt: null,
        outcome: null,
        endReason: null,
        resolvedBy: null,
      }),
    );
  }

  alertEnded(alert: Alert, resolvedBy: string | null): Promise<void> {
    return this.persist(() =>
      this.alerts.update(alert.id, {
        severity: alert.severity,
        message: alert.message,
        endedAt: alert.endedAt ? new Date(alert.endedAt) : new Date(),
        outcome: alert.outcome ?? null,
        endReason: alert.endReason ?? null,
        resolvedBy,
      }),
    );
  }

  comms(
    sessionId: string,
    payload: CommsTransmissionPayload | CommsReadbackPayload,
    meta: { userId: string | null; sttLatencyMs: number | null },
  ): Promise<void> {
    const callsign =
      payload.speaker === 'pilot' ? payload.callsign : (payload.clearance?.callsign ?? null);
    return this.persist(async () => {
      await this.transmissions.save(
        this.transmissions.create({
          id: payload.id,
          sessionId,
          speaker: payload.speaker,
          audioPath: payload.audioUrl ?? null,
          transcript: payload.transcript,
          sttLatencyMs: meta.sttLatencyMs,
          callsign,
          userId: meta.userId,
          payload: payload as unknown as Record<string, unknown>,
        }),
      );
      if (payload.clearance) await this.saveClearance(payload.id, payload.clearance);
    });
  }

  faultInjected(sessionId: string, injection: FaultInjection): Promise<void> {
    return this.persist(() =>
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

  saveFrames(frames: { sessionId: string; at: Date; aircraft: Aircraft[] }[]): Promise<void> {
    if (frames.length === 0) return Promise.resolve();
    return this.persist(() => this.frames.insert(frames));
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

  private async persist(write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (error) {
      this.logger.warn(`Database write skipped: ${(error as Error).message}`);
    }
  }
}
