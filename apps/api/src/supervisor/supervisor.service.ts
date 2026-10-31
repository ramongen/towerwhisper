import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  Alert,
  AlertType,
  AnalyticsRange,
  CommsReadbackPayload,
  CommsTransmissionPayload,
  ReplayFrame,
  ReplaySession,
  ReplaySessionSummary,
  SupervisorAnalytics,
} from '@towerwhisper/shared';
import { In, type Repository } from 'typeorm';
import {
  AlertEntity,
  SessionEntity,
  TrafficFrameEntity,
  TransmissionEntity,
  UserEntity,
} from '../database/entities';
import { SectorRegistry } from '../sectors/sector-registry';
import { findSector, isSectorId } from '../sectors/sectors';
import {
  ANALYTICS_BUCKET_S,
  ANALYTICS_RANGE_S,
  MAX_REPLAY_FRAMES,
  RECENT_ALERTS,
  REPLAY_SESSIONS_LIMIT,
  RESOLVE_BUCKETS,
} from './constants';

type CommsPayload = CommsTransmissionPayload | CommsReadbackPayload;

/**
 * Read-only views of what the sectors recorded: statistics for the supervisor dashboard and
 * full sessions (radar frames, comms, alerts) for the replay.
 */
@Injectable()
export class SupervisorService {
  constructor(
    @InjectRepository(AlertEntity) private readonly alerts: Repository<AlertEntity>,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(TransmissionEntity)
    private readonly transmissions: Repository<TransmissionEntity>,
    @InjectRepository(TrafficFrameEntity) private readonly frames: Repository<TrafficFrameEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly sectors: SectorRegistry,
  ) {}

  async analytics(range: AnalyticsRange, sector: string | null): Promise<SupervisorAnalytics> {
    if (!(range in ANALYTICS_RANGE_S)) throw new BadRequestException(`Unknown range ${range}`);
    if (sector !== null && !isSectorId(sector))
      throw new BadRequestException(`Unknown sector ${sector}`);
    const to = Date.now();
    const from = to - ANALYTICS_RANGE_S[range] * 1000;
    const bucketS = ANALYTICS_BUCKET_S[range];

    const sessionRows = await this.sessions
      .createQueryBuilder('s')
      .where('s.started_at <= :to', { to: new Date(to) })
      .andWhere('(s.ended_at IS NULL OR s.ended_at >= :from)', { from: new Date(from) })
      .andWhere(sector ? 's.sector_id = :sector' : 'TRUE', { sector })
      .getMany();
    const sectorOfSession = new Map(sessionRows.map((s) => [s.id, s.sectorId]));
    const sessionIds = sessionRows.map((s) => s.id);

    const alertRows = sessionIds.length
      ? await this.alerts.find({
          where: { sessionId: In(sessionIds) },
          order: { raisedAt: 'ASC' },
        })
      : [];
    const inRange = alertRows.filter((a) => a.raisedAt.getTime() >= from);
    const resolved = inRange.filter((a) => a.outcome === 'resolved' && a.endedAt);
    const resolveS = (a: AlertEntity) => (a.endedAt!.getTime() - a.raisedAt.getTime()) / 1000;

    // Session time inside the range, per sector: the base of the alert rate.
    const hoursBySector = new Map<string, number>();
    for (const s of sessionRows) {
      const start = Math.max(from, s.startedAt.getTime());
      const end = Math.min(to, s.endedAt?.getTime() ?? to);
      if (end > start) {
        hoursBySector.set(s.sectorId, (hoursBySector.get(s.sectorId) ?? 0) + (end - start) / 3.6e6);
      }
    }
    const sessionHours = [...hoursBySector.values()].reduce((a, b) => a + b, 0);

    const timeline: SupervisorAnalytics['timeline'] = [];
    const firstBucket = Math.floor(from / 1000 / bucketS) * bucketS * 1000;
    for (let t = firstBucket; t <= to; t += bucketS * 1000) {
      timeline.push({ t: new Date(t).toISOString(), caution: 0, warning: 0, resolved: 0 });
    }
    const bucketOf = (ms: number) =>
      timeline[Math.min(timeline.length - 1, Math.floor((ms - firstBucket) / (bucketS * 1000)))];
    for (const a of inRange) bucketOf(a.raisedAt.getTime())[a.severity]++;
    for (const a of resolved) bucketOf(a.endedAt!.getTime()).resolved++;

    const types = new Map<AlertType, AlertEntity[]>();
    for (const a of inRange) types.set(a.type, [...(types.get(a.type) ?? []), a]);
    const byType = [...types.entries()]
      .map(([type, rows]) => {
        const done = rows.filter((a) => a.outcome === 'resolved' && a.endedAt);
        return {
          type,
          count: rows.length,
          resolved: done.length,
          meanResolveS: mean(done.map(resolveS)),
        };
      })
      .sort((a, b) => b.count - a.count);

    const live = this.sectors.all().filter((r) => !sector || r.id === sector);
    const bySector = live.map((runtime) => {
      const rows = inRange.filter((a) => sectorOfSession.get(a.sessionId) === runtime.id);
      const done = rows.filter((a) => a.outcome === 'resolved' && a.endedAt);
      const hours = hoursBySector.get(runtime.id) ?? 0;
      return {
        sectorId: runtime.id,
        raised: rows.length,
        resolved: done.length,
        cleared: rows.filter((a) => a.outcome === 'cleared').length,
        meanResolveS: mean(done.map(resolveS)),
        ratePerHour: hours > 0 ? round(rows.length / hours, 2) : null,
      };
    });

    const resolveHistogram = RESOLVE_BUCKETS.map((b) => ({
      label: b.label,
      count: resolved.filter((a) => {
        const s = resolveS(a);
        return s >= b.fromS && (b.toS === null || s < b.toS);
      }).length,
    }));

    const atcRows = sessionIds.length
      ? await this.transmissions
          .createQueryBuilder('t')
          .select('t.user_id', 'userId')
          .addSelect('COUNT(*)::int', 'count')
          .where('t.session_id IN (:...ids)', { ids: sessionIds })
          .andWhere("t.speaker = 'atc'")
          .andWhere('t.created_at >= :from', { from: new Date(from) })
          .groupBy('t.user_id')
          .getRawMany<{ userId: string | null; count: number }>()
      : [];
    const transmissionsBy = new Map(
      atcRows.filter((r) => r.userId).map((r) => [r.userId!, r.count]),
    );
    const resolvedBy = new Map<string, AlertEntity[]>();
    for (const a of resolved) {
      if (a.resolvedBy) resolvedBy.set(a.resolvedBy, [...(resolvedBy.get(a.resolvedBy) ?? []), a]);
    }
    const userIds = [...new Set([...transmissionsBy.keys(), ...resolvedBy.keys()])];
    const people = userIds.length ? await this.users.findBy({ id: In(userIds) }) : [];
    const controllers = people
      .map((u) => ({
        userId: u.id,
        name: u.name,
        sectorId: u.sectorId,
        transmissions: transmissionsBy.get(u.id) ?? 0,
        resolved: resolvedBy.get(u.id)?.length ?? 0,
        meanResolveS: mean((resolvedBy.get(u.id) ?? []).map(resolveS)),
      }))
      .sort((a, b) => b.transmissions + b.resolved - (a.transmissions + a.resolved));

    const resolveTimes = resolved.map(resolveS);
    return {
      range,
      sectorId: sector,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      bucketS,
      totals: {
        raised: inRange.length,
        warnings: inRange.filter((a) => a.severity === 'warning').length,
        cautions: inRange.filter((a) => a.severity === 'caution').length,
        resolved: resolved.length,
        cleared: inRange.filter((a) => a.outcome === 'cleared').length,
        active: live.reduce((n, r) => n + r.alerts.list().length, 0),
        meanResolveS: mean(resolveTimes),
        medianResolveS: median(resolveTimes),
        ratePerHour: sessionHours > 0 ? round(inRange.length / sessionHours, 2) : null,
        sessionHours: round(sessionHours, 2),
        transmissions: atcRows.reduce((n, r) => n + r.count, 0),
      },
      timeline,
      byType,
      bySector,
      resolveHistogram,
      controllers,
      recent: [...inRange]
        .reverse()
        .slice(0, RECENT_ALERTS)
        .map((a) => ({ ...toAlert(a), sectorId: sectorOfSession.get(a.sessionId) ?? '' })),
    };
  }

  async replaySessions(sector: string): Promise<ReplaySessionSummary[]> {
    if (!isSectorId(sector)) throw new BadRequestException(`Unknown sector ${sector}`);
    const liveId = this.sectors.get(sector).session.id;
    const rows = await this.sessions
      .createQueryBuilder('s')
      .where('s.sector_id = :sector', { sector })
      .andWhere('EXISTS (SELECT 1 FROM traffic_frames f WHERE f.session_id = s.id)')
      .orderBy('s.started_at', 'DESC')
      .limit(REPLAY_SESSIONS_LIMIT)
      .getMany();
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const count = async (table: string) =>
      new Map(
        (
          await this.sessions.manager.query<{ id: string; n: number }[]>(
            `SELECT session_id AS id, COUNT(*)::int AS n FROM ${table} WHERE session_id = ANY($1) GROUP BY session_id`,
            [ids],
          )
        ).map((r) => [r.id, r.n]),
      );
    const alertCounts = await count('alerts');
    const transmissionCounts = await count('transmissions');
    return rows.map((s) =>
      this.summary(s, liveId, alertCounts.get(s.id) ?? 0, transmissionCounts.get(s.id) ?? 0),
    );
  }

  async replay(id: string): Promise<ReplaySession> {
    const s = await this.sessions.findOneBy({ id });
    const sector = s && findSector(s.sectorId);
    if (!s || !sector) throw new NotFoundException('No such session');
    const liveId = this.sectors.get(sector.definition.id).session.id;

    const frameRows = await this.frames.find({
      where: { sessionId: id },
      order: { at: 'ASC' },
      select: { at: true, aircraft: true },
    });
    const stride = Math.max(1, Math.ceil(frameRows.length / MAX_REPLAY_FRAMES));
    const frames: ReplayFrame[] = frameRows
      .filter((_, i) => i % stride === 0 || i === frameRows.length - 1)
      .map((f) => ({ t: f.at.getTime(), aircraft: f.aircraft }));

    const commsRows = await this.transmissions.find({
      where: { sessionId: id },
      order: { createdAt: 'ASC' },
    });
    const comms = commsRows
      .map((t): CommsPayload => {
        if (t.payload) return t.payload as unknown as CommsPayload;
        const at = t.createdAt.toISOString();
        return t.speaker === 'atc'
          ? {
              id: t.id,
              at,
              speaker: 'atc',
              transcript: t.transcript,
              clearance: null,
              audioUrl: t.audioPath,
            }
          : {
              id: t.id,
              at,
              speaker: 'pilot',
              callsign: t.callsign ?? '',
              transcript: t.transcript,
              clearance: null,
              audioUrl: t.audioPath,
              check: null,
            };
      })
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

    const alertRows = await this.alerts.find({
      where: { sessionId: id },
      order: { raisedAt: 'ASC' },
    });
    return {
      session: this.summary(s, liveId, alertRows.length, commsRows.length, frames.at(-1)?.t),
      sector: sector.info,
      frames,
      comms,
      alerts: alertRows.map(toAlert),
    };
  }

  private summary(
    s: SessionEntity,
    liveId: string,
    alerts: number,
    transmissions: number,
    lastFrameMs?: number,
  ): ReplaySessionSummary {
    const live = s.id === liveId;
    const end =
      s.endedAt?.getTime() ?? (live ? Date.now() : (lastFrameMs ?? s.startedAt.getTime()));
    return {
      id: s.id,
      sectorId: s.sectorId,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      durationS: Math.max(0, Math.round((end - s.startedAt.getTime()) / 1000)),
      alerts,
      transmissions,
      live,
    };
  }
}

function toAlert(a: AlertEntity): Alert {
  return {
    id: a.id,
    type: a.type,
    severity: a.severity,
    callsigns: a.callsigns,
    message: a.message,
    details: a.details,
    raisedAt: a.raisedAt.toISOString(),
    ...(a.endedAt ? { endedAt: a.endedAt.toISOString() } : {}),
    ...(a.outcome ? { outcome: a.outcome } : {}),
    ...(a.endReason ? { endReason: a.endReason } : {}),
  };
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return round(values.reduce((a, b) => a + b, 0) / values.length, 1);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, 1);
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
