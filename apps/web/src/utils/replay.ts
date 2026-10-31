import type { Alert, AlertRecord } from '@towerwhisper/shared';
import type { RouteLocationRaw } from 'vue-router';

/** A replay opens this long before the alert, to show what led to it. */
export const REPLAY_LEAD_S = 20;

/** The replay of the session an alert happened in, a little before it was raised. */
export function replayOf(
  alert: Pick<Alert, 'id' | 'raisedAt'> & Pick<AlertRecord, 'sectorId' | 'sessionId'>,
): RouteLocationRaw {
  return {
    name: 'supervisor-replay',
    query: {
      sector: alert.sectorId,
      session: alert.sessionId,
      at: String(Date.parse(alert.raisedAt) - REPLAY_LEAD_S * 1000),
      alert: alert.id,
    },
  };
}
