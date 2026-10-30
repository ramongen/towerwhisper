import type { FaultConfig, SessionStats } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** Demo-panel fault configuration (synced via demo:faults) and session statistics. */
export const useDemoStore = defineStore('demo', () => {
  const faults = ref<FaultConfig | null>(null);
  const stats = ref<SessionStats | null>(null);

  function setFaults(config: FaultConfig): void {
    faults.value = config;
  }

  function setStats(next: SessionStats): void {
    stats.value = next;
  }

  return { faults, stats, setFaults, setStats };
});
