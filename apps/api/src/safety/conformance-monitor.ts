import { Injectable } from '@nestjs/common';
import type { Aircraft, AlertType, Clearance } from '@towerwhisper/shared';
import { AlertRegistry, alertKey, type AlertDraft } from './alert-registry';
import {
  CONFORMANCE_PERSISTENCE_S,
  EXECUTION_GRACE_S,
  HEADING_REACHED_DEG,
  LEVEL_BUST_MAX_VS_FPM,
  LEVEL_BUST_WINDOW_FT,
  LEVEL_REACHED_FT,
  WRONG_TURN_RATE_DEG_S,
  WRONG_VERTICAL_FPM,
} from './constants';

type ConformanceType = Extract<AlertType, 'WRONG_TURN' | 'WRONG_VERTICAL' | 'LEVEL_BUST'>;
const TYPES: ConformanceType[] = ['WRONG_TURN', 'WRONG_VERTICAL', 'LEVEL_BUST'];

interface Watch {
  clearance: Clearance;
  startedAtMs: number;
  /** +1 climb, -1 descent, 0 maintain; fixed at the start so a bust past the level stays a bust. */
  verticalDir: number;
  headingDone: boolean;
  altitudeDone: boolean;
  deviatingSince: Partial<Record<ConformanceType, number>>;
}

/**
 * Runs every tick for aircraft with an active (read back) clearance and compares what the
 * aircraft does with what it was cleared to do, never with the simulator targets, so demo
 * execution faults are caught like real ones. A deviation must last 4 s (simulation time)
 * before an alert; the alert clears itself when the aircraft conforms again.
 */
@Injectable()
export class ConformanceMonitor {
  private readonly watches = new Map<string, Watch>();

  constructor(private readonly alerts: AlertRegistry) {}

  /** Start monitoring a clearance (called when it has been read back). */
  watch(clearance: Clearance, aircraft: Aircraft, simNowMs: number): void {
    if (!clearance.heading && !clearance.altitude) return;
    this.stop(clearance.callsign, 'new clearance');
    const alt = clearance.altitude;
    const verticalDir =
      !alt || alt.action === 'maintain' ? 0 : Math.sign(alt.valueFt - aircraft.altitudeFt);
    this.watches.set(clearance.callsign, {
      clearance,
      startedAtMs: simNowMs,
      verticalDir,
      headingDone: !clearance.heading,
      altitudeDone: !alt,
      deviatingSince: {},
    });
  }

  stop(callsign: string, reason: string): void {
    this.watches.delete(callsign);
    for (const type of TYPES) this.alerts.clear(alertKey(type, callsign), reason);
  }

  tick(aircraft: Aircraft[], simNowMs: number): void {
    for (const [callsign, w] of [...this.watches]) {
      const a = aircraft.find((x) => x.callsign === callsign);
      if (!a) {
        this.stop(callsign, 'aircraft left the scope');
        continue;
      }
      const elapsedS = (simNowMs - w.startedAtMs) / 1000;
      const deviations = new Map<ConformanceType, AlertDraft>();
      if (!w.headingDone) this.checkHeading(w, a, elapsedS, deviations);
      if (!w.altitudeDone) this.checkAltitude(w, a, elapsedS, deviations);

      for (const type of TYPES) {
        const draft = deviations.get(type);
        const key = alertKey(type, callsign);
        if (!draft) {
          delete w.deviatingSince[type];
          this.alerts.clear(key, 'aircraft conforming again');
          continue;
        }
        w.deviatingSince[type] ??= simNowMs;
        if ((simNowMs - w.deviatingSince[type]) / 1000 >= CONFORMANCE_PERSISTENCE_S) {
          this.alerts.raise(key, draft);
        }
      }

      if (w.headingDone && w.altitudeDone) this.watches.delete(callsign);
    }
  }

  reset(): void {
    this.watches.clear();
  }

  private checkHeading(
    w: Watch,
    a: Aircraft,
    elapsedS: number,
    out: Map<ConformanceType, AlertDraft>,
  ): void {
    const cleared = w.clearance.heading!;
    const delta = signedDelta(a.headingDeg, cleared.valueDeg);
    if (
      Math.abs(delta) <= HEADING_REACHED_DEG &&
      Math.abs(a.turnRateDegS) < WRONG_TURN_RATE_DEG_S
    ) {
      w.headingDone = true;
      return;
    }
    // Which way the aircraft should be turning: as cleared, or the short way for 'any'.
    const expected = cleared.turn === 'left' ? -1 : cleared.turn === 'right' ? 1 : Math.sign(delta);
    const rate = a.turnRateDegS;
    const wrongWay =
      rate * expected < -WRONG_TURN_RATE_DEG_S && (cleared.turn !== 'any' || Math.abs(delta) < 170);
    const notTurning =
      elapsedS > EXECUTION_GRACE_S &&
      Math.abs(rate) < WRONG_TURN_RATE_DEG_S &&
      Math.abs(delta) > HEADING_REACHED_DEG;
    if (!wrongWay && !notTurning) return;

    const cs = a.callsign;
    const clearedText = `${cleared.turn === 'any' ? '' : cleared.turn.toUpperCase() + ' '}heading ${pad(cleared.valueDeg)}`;
    out.set('WRONG_TURN', {
      type: 'WRONG_TURN',
      severity: 'warning',
      callsigns: [cs],
      message: wrongWay
        ? `${cs} cleared ${clearedText}, turning ${rate > 0 ? 'RIGHT' : 'LEFT'} through ${pad(a.headingDeg)}°`
        : `${cs} cleared ${clearedText}, not turning (heading ${pad(a.headingDeg)}°)`,
      details: {
        clearedHeading: cleared.valueDeg,
        clearedTurn: cleared.turn,
        headingDeg: a.headingDeg,
        turnRateDegS: rate,
      },
    });
  }

  private checkAltitude(
    w: Watch,
    a: Aircraft,
    elapsedS: number,
    out: Map<ConformanceType, AlertDraft>,
  ): void {
    const cleared = w.clearance.altitude!;
    const target = cleared.valueFt;
    const vs = a.verticalSpeedFpm;
    const cs = a.callsign;
    const level = levelText(cleared);
    const details = { clearedFt: target, altitudeFt: a.altitudeFt, verticalSpeedFpm: vs };

    if (Math.abs(target - a.altitudeFt) <= LEVEL_REACHED_FT && Math.abs(vs) < WRONG_VERTICAL_FPM) {
      w.altitudeDone = true;
      return;
    }

    if (w.verticalDir === 0) {
      if (Math.abs(vs) > WRONG_VERTICAL_FPM) {
        out.set('WRONG_VERTICAL', {
          type: 'WRONG_VERTICAL',
          severity: 'warning',
          callsigns: [cs],
          details,
          message: `${cs} cleared to maintain ${level}, ${vs > 0 ? 'climbing' : 'descending'} at ${fpm(vs)}`,
        });
      }
      return;
    }

    // Feet still to go in the cleared direction (negative once past the cleared level).
    const remaining = (target - a.altitudeFt) * w.verticalDir;
    const towards = vs * w.verticalDir; // vertical speed in the cleared direction
    const verb = w.verticalDir < 0 ? 'descent' : 'climb';

    if (remaining < -LEVEL_BUST_WINDOW_FT) {
      out.set('LEVEL_BUST', {
        type: 'LEVEL_BUST',
        severity: 'warning',
        callsigns: [cs],
        details,
        message: `${cs} busted ${level}: now ${Math.round(a.altitudeFt)} ft`,
      });
    } else if (remaining < LEVEL_BUST_WINDOW_FT && towards > LEVEL_BUST_MAX_VS_FPM) {
      const secondsToBust = Math.max(0, Math.round(remaining / (towards / 60)));
      out.set('LEVEL_BUST', {
        type: 'LEVEL_BUST',
        severity: 'warning',
        callsigns: [cs],
        details: { ...details, secondsToBust },
        message: `${cs} will bust ${level} in ${secondsToBust} s (${fpm(vs)})`,
      });
    } else if (remaining > 0 && towards < -WRONG_VERTICAL_FPM) {
      out.set('WRONG_VERTICAL', {
        type: 'WRONG_VERTICAL',
        severity: 'warning',
        callsigns: [cs],
        details,
        message: `${cs} cleared ${verb} to ${level}, ${vs > 0 ? 'climbing' : 'descending'} at ${fpm(vs)}`,
      });
    } else if (
      remaining > LEVEL_BUST_WINDOW_FT &&
      elapsedS > EXECUTION_GRACE_S &&
      Math.abs(vs) < WRONG_VERTICAL_FPM
    ) {
      out.set('WRONG_VERTICAL', {
        type: 'WRONG_VERTICAL',
        severity: 'warning',
        callsigns: [cs],
        details,
        message: `${cs} cleared ${verb} to ${level}, still level at ${Math.round(a.altitudeFt)} ft`,
      });
    }
  }
}

function signedDelta(current: number, target: number): number {
  const d = ((((target - current) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

function pad(deg: number): string {
  return String(Math.round(deg) % 360).padStart(3, '0');
}

function fpm(vs: number): string {
  return `${Math.abs(Math.round(vs / 100) * 100)} ft/min`;
}

function levelText(alt: NonNullable<Clearance['altitude']>): string {
  return alt.flightLevel ? `FL${String(alt.valueFt / 100).padStart(3, '0')}` : `${alt.valueFt} ft`;
}
