import type { Alert } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** Active alerts (newest first) and history. Alerts are raised and cleared by the backend only. */
export const useAlertStore = defineStore('alerts', () => {
  const active = ref<Alert[]>([]);
  const history = ref<Alert[]>([]);

  function raise(alert: Alert): void {
    // The backend may re-send an alert with the same id (e.g. NO_CONTACT caution -> warning).
    active.value = [alert, ...active.value.filter((a) => a.id !== alert.id)];
  }

  function clear(id: string): void {
    const alert = active.value.find((a) => a.id === id);
    if (alert) history.value.push(alert);
    active.value = active.value.filter((a) => a.id !== id);
  }

  return { active, history, raise, clear };
});
