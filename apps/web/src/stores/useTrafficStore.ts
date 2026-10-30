import type { Aircraft } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

/** Aircraft from traffic:update (4 Hz) and the radar selection. */
export const useTrafficStore = defineStore('traffic', () => {
  // shallowRef: the array is replaced on every update; RadarScope reads it into plain objects.
  const aircraft = shallowRef<Aircraft[]>([]);
  const lastUpdateAt = ref<number | null>(null);
  const selectedCallsign = ref<string | null>(null);

  function setAircraft(next: Aircraft[]): void {
    aircraft.value = next;
    lastUpdateAt.value = Date.now();
  }

  function select(callsign: string | null): void {
    selectedCallsign.value = callsign;
  }

  return { aircraft, lastUpdateAt, selectedCallsign, setAircraft, select };
});
