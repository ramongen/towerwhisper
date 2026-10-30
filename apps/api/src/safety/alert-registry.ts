import { Injectable } from '@nestjs/common';
import type { Alert } from '@towerwhisper/shared';
import { randomUUID } from 'node:crypto';
import { ALERT_UPDATE_MIN_INTERVAL_MS } from './constants';

export type AlertDraft = Omit<Alert, 'id' | 'raisedAt' | 'acknowledgedAt'>;

export interface AlertListener {
  raised(alert: Alert): void;
  cleared(alert: Alert, reason: string): void;
}

/**
 * Active alerts, one per key (e.g. 'LEVEL_BUST:ROT301'). Raising an existing key updates
 * the same alert (NO_CONTACT caution -> warning keeps its id). Pure in-memory bookkeeping:
 * listeners outside the safety module persist and broadcast.
 */
@Injectable()
export class AlertRegistry {
  private readonly active = new Map<string, { alert: Alert; emittedAt: number }>();
  private readonly listeners: AlertListener[] = [];

  subscribe(listener: AlertListener): void {
    this.listeners.push(listener);
  }

  raise(key: string, draft: AlertDraft): Alert {
    const existing = this.active.get(key);
    if (existing) {
      const { alert } = existing;
      const escalated = alert.severity !== draft.severity;
      const changed = alert.message !== draft.message;
      alert.severity = draft.severity;
      alert.message = draft.message;
      alert.details = draft.details;
      alert.callsigns = draft.callsigns;
      if (escalated) alert.acknowledgedAt = undefined; // a new level needs a new ACK
      const due = Date.now() - existing.emittedAt >= ALERT_UPDATE_MIN_INTERVAL_MS;
      if (escalated || (changed && due)) this.emitRaised(key, alert);
      return alert;
    }
    const alert: Alert = { ...draft, id: randomUUID(), raisedAt: new Date().toISOString() };
    this.emitRaised(key, alert);
    return alert;
  }

  clear(key: string, reason: string): void {
    const entry = this.active.get(key);
    if (!entry) return;
    this.active.delete(key);
    for (const l of this.listeners) l.cleared(entry.alert, reason);
  }

  /** Clears every alert whose key matches. */
  clearWhere(predicate: (key: string, alert: Alert) => boolean, reason: string): void {
    for (const [key, { alert }] of [...this.active]) {
      if (predicate(key, alert)) this.clear(key, reason);
    }
  }

  has(key: string): boolean {
    return this.active.has(key);
  }

  acknowledge(id: string): Alert | null {
    for (const { alert } of this.active.values()) {
      if (alert.id === id) {
        alert.acknowledgedAt = new Date().toISOString();
        return alert;
      }
    }
    return null;
  }

  list(): Alert[] {
    return [...this.active.values()].map((e) => e.alert);
  }

  /** Scenario reset: forget everything without emitting (screens clear themselves). */
  reset(): void {
    this.active.clear();
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
