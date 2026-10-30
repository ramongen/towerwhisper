import type { AckAlertResponse, Alert } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../utils/api';

export type AlertLevel = Alert['severity'];

/** Active alerts (newest first) and history. Alerts are raised and cleared by the backend only. */
export const useAlertStore = defineStore('alerts', () => {
  const active = ref<Alert[]>([]);
  const history = ref<Alert[]>([]);

  function raise(alert: Alert): void {
    // The backend may re-send an alert with the same id (e.g. NO_CONTACT caution -> warning).
    const existing = active.value.find((a) => a.id === alert.id);
    if (existing) {
      // An escalation comes without acknowledgedAt (JSON drops undefined): it needs a new ACK.
      Object.assign(existing, alert, { acknowledgedAt: alert.acknowledgedAt });
      return;
    }
    active.value = [alert, ...active.value];
  }

  function clear(id: string): void {
    const alert = active.value.find((a) => a.id === id);
    if (alert) history.value.push(alert);
    active.value = active.value.filter((a) => a.id !== id);
  }

  function clearAll(): void {
    active.value = [];
  }

  async function acknowledge(id: string): Promise<void> {
    const { acknowledgedAt } = await api<AckAlertResponse>('POST', `/alerts/${id}/ack`);
    const alert = active.value.find((a) => a.id === id);
    if (alert) alert.acknowledgedAt = acknowledgedAt;
  }

  /** Worst alert level per callsign: drives the radar symbol and the flight strip edge. */
  const levelByCallsign = computed(() => {
    const levels = new Map<string, AlertLevel>();
    for (const alert of active.value) {
      for (const cs of alert.callsigns) {
        if (levels.get(cs) !== 'warning') levels.set(cs, alert.severity);
      }
    }
    return levels;
  });

  /** Unacknowledged first, then newest first. */
  const sorted = computed(() =>
    [...active.value].sort((a, b) => {
      if (!a.acknowledgedAt !== !b.acknowledgedAt) return a.acknowledgedAt ? 1 : -1;
      if (a.severity !== b.severity) return a.severity === 'warning' ? -1 : 1;
      return Date.parse(b.raisedAt) - Date.parse(a.raisedAt);
    }),
  );

  return { active, history, sorted, levelByCallsign, raise, clear, clearAll, acknowledge };
});
