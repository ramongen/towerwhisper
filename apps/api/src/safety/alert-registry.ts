import { Injectable } from '@nestjs/common';
import type { Alert, AlertOutcome } from '@towerwhisper/shared';
import { randomUUID } from 'node:crypto';
import { ALERT_UPDATE_MIN_INTERVAL_MS, CONDITION_ALERT_TYPES } from './constants';

export type AlertDraft = Omit<Alert, 'id' | 'raisedAt' | 'endedAt' | 'outcome' | 'endReason'>;

export interface AlertListener {
  raised(alert: Alert): void;
  /** The alert ended (resolved by the controller, or the condition went away). */
  cleared(alert: Alert, reason: string): void;
}

const SEVERITY_RANK = { caution: 1, warning: 2 } as const;

/**
 * Active alerts, one per key (e.g. 'LEVEL_BUST:ROT301'), and the history of ended ones.
 * Raising an existing key updates the same alert (NO_CONTACT caution -> warning keeps its
 * id). Pure in-memory bookkeeping: listeners outside the safety module persist and broadcast.
 *
 * When the controller resolves an alert whose condition is still true (an aircraft still
 * without contact, still off its level), it is not raised again until the condition has
 * gone away, unless it gets worse (caution -> warning).
 */
@Injectable()
export class AlertRegistry {
  private readonly active = new Map<string, { alert: Alert; emittedAt: number }>();
  /** Resolved condition alerts whose condition has not cleared yet. */
  private readonly suppressed = new Map<string, Alert>();
  private ended: Alert[] = [];
  private readonly listeners: AlertListener[] = [];

  subscribe(listener: AlertListener): void {
    this.listeners.push(listener);
  }

  raise(key: string, draft: AlertDraft): Alert | null {
    const resolved = this.suppressed.get(key);
    if (resolved) {
      if (SEVERITY_RANK[draft.severity] <= SEVERITY_RANK[resolved.severity]) return null;
      this.suppressed.delete(key); // worse than what the controller resolved: alert again
    }

    const existing = this.active.get(key);
    if (existing) {
      const { alert } = existing;
      const escalated = alert.severity !== draft.severity;
      const changed = alert.message !== draft.message;
      alert.severity = draft.severity;
      alert.message = draft.message;
      alert.details = draft.details;
      alert.callsigns = draft.callsigns;
      const due = Date.now() - existing.emittedAt >= ALERT_UPDATE_MIN_INTERVAL_MS;
      if (escalated || (changed && due)) this.emitRaised(key, alert);
      return alert;
    }
    const alert: Alert = { ...draft, id: randomUUID(), raisedAt: new Date().toISOString() };
    this.emitRaised(key, alert);
    return alert;
  }

  /** The condition went away: end the alert (and forget a resolution of it). */
  clear(key: string, reason: string): void {
    this.suppressed.delete(key);
    const entry = this.active.get(key);
    if (entry) this.end(key, entry.alert, 'cleared', reason);
  }

  /** Clears every alert (active or resolved-and-suppressed) whose key matches. */
  clearWhere(predicate: (key: string, alert: Alert) => boolean, reason: string): void {
    for (const [key, alert] of [...this.suppressed]) {
      if (predicate(key, alert)) this.suppressed.delete(key);
    }
    for (const [key, { alert }] of [...this.active]) {
      if (predicate(key, alert)) this.clear(key, reason);
    }
  }

  /** The controller marks an active alert as resolved. */
  resolve(id: string): Alert | null {
    for (const [key, { alert }] of this.active) {
      if (alert.id !== id) continue;
      if (CONDITION_ALERT_TYPES.includes(alert.type)) this.suppressed.set(key, alert);
      this.end(key, alert, 'resolved', 'resolved by the controller');
      return alert;
    }
    return null;
  }

  has(key: string): boolean {
    return this.active.has(key);
  }

  list(): Alert[] {
    return [...this.active.values()].map((e) => e.alert);
  }

  /** Alerts that ended in this session, oldest first. */
  history(): Alert[] {
    return this.ended;
  }

  /** Scenario reset: forget everything without emitting (screens clear themselves). */
  reset(): void {
    this.active.clear();
    this.suppressed.clear();
    this.ended = [];
  }

  private end(key: string, alert: Alert, outcome: AlertOutcome, reason: string): void {
    this.active.delete(key);
    alert.endedAt = new Date().toISOString();
    alert.outcome = outcome;
    alert.endReason = reason;
    this.ended.push(alert);
    for (const l of this.listeners) l.cleared(alert, reason);
  }

  private emitRaised(key: string, alert: Alert): void {
    this.active.set(key, { alert, emittedAt: Date.now() });
    for (const l of this.listeners) l.raised(alert);
  }
}

/** 'LEVEL_BUST', 'ROT301' -> 'LEVEL_BUST:ROT301' */
export function alertKey(type: Alert['type'], ...callsigns: string[]): string {
  return [type, ...[...callsigns].sort()].join(':');
}
