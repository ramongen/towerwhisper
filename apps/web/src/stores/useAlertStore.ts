import type { Alert, AlertClearedPayload, ResolveAlertResponse } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../utils/api';

export type AlertLevel = Alert['severity'];

/**
 * Active alerts and the alerts that ended (resolved by the controller or cleared by the
 * system). Both come from the backend, so the history survives a page refresh; only a
 * scenario reset empties it.
 */
export const useAlertStore = defineStore('alerts', () => {
  const active = ref<Alert[]>([]);
  const history = ref<Alert[]>([]);
  /** In a replay: the replayed moment, so "2 min ago" is counted from it (null when live). */
  const replayNow = ref<number | null>(null);

  function raise(alert: Alert): void {
    // The backend may re-send an alert with the same id (e.g. NO_CONTACT caution -> warning).
    const existing = active.value.find((a) => a.id === alert.id);
    if (existing) {
      Object.assign(existing, alert);
      return;
    }
    active.value = [alert, ...active.value];
  }

  function clear({ id, reason, outcome, at }: AlertClearedPayload): void {
    const alert = active.value.find((a) => a.id === id);
    active.value = active.value.filter((a) => a.id !== id);
    if (alert && !history.value.some((a) => a.id === id)) {
      history.value = [...history.value, { ...alert, endedAt: at, outcome, endReason: reason }];
    }
  }

  function setHistory(ended: Alert[]): void {
    history.value = ended;
  }

  function clearAll(): void {
    active.value = [];
    history.value = [];
  }

  /** The controller resolved the alert; the backend confirms with alert:cleared. */
  async function resolve(id: string): Promise<void> {
    await api<ResolveAlertResponse>('POST', `/alerts/${id}/resolve`);
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

  /** Warnings first, then newest first. */
  const sorted = computed(() =>
    [...active.value].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'warning' ? -1 : 1;
      return Date.parse(b.raisedAt) - Date.parse(a.raisedAt);
    }),
  );

  /** Newest ended alert first. */
  const pastNewestFirst = computed(() => [...history.value].reverse());

  return {
    active,
    history,
    replayNow,
    sorted,
    pastNewestFirst,
    levelByCallsign,
    raise,
    clear,
    setHistory,
    clearAll,
    resolve,
  };
});
