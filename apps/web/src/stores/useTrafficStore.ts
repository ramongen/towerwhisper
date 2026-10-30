import type { Aircraft, ProbeResultPayload } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

/** Seconds between two history dots behind an aircraft symbol. */
const TRAIL_INTERVAL_MS = 6000;
const TRAIL_LENGTH = 5;

/**
 * Plain (non-reactive) buffers for the radar's 60 fps loop: the last two server snapshots
 * for interpolation, and the position trail. Never read through Vue reactivity per frame.
 */
export const radarFeed = {
  previous: new Map<string, Aircraft>(),
  current: new Map<string, Aircraft>(),
  previousAt: 0,
  currentAt: 0,
  trails: new Map<string, { lat: number; lon: number }[]>(),
  lastTrailAt: 0,
  /** Latest Clearance Probe trajectory, drawn dotted for a while after the instruction. */
  probe: null as { result: ProbeResultPayload; at: number } | null,
};

export function setProbe(result: ProbeResultPayload): void {
  radarFeed.probe = { result, at: performance.now() };
}

/** Aircraft from traffic:update (4 Hz) and the radar selection. */
export const useTrafficStore = defineStore('traffic', () => {
  // shallowRef: the array is replaced on every update; RadarScope reads radarFeed instead.
  const aircraft = shallowRef<Aircraft[]>([]);
  const lastUpdateAt = ref<number | null>(null);
  const selectedCallsign = ref<string | null>(null);

  function setAircraft(next: Aircraft[]): void {
    const now = performance.now();
    radarFeed.previous = radarFeed.current;
    radarFeed.previousAt = radarFeed.currentAt;
    radarFeed.current = new Map(next.map((a) => [a.callsign, a]));
    radarFeed.currentAt = now;

    if (now - radarFeed.lastTrailAt >= TRAIL_INTERVAL_MS) {
      radarFeed.lastTrailAt = now;
      for (const a of next) {
        const trail = radarFeed.trails.get(a.callsign) ?? [];
        trail.unshift({ lat: a.lat, lon: a.lon });
        radarFeed.trails.set(a.callsign, trail.slice(0, TRAIL_LENGTH));
      }
    }

    aircraft.value = next;
    lastUpdateAt.value = Date.now();
    if (selectedCallsign.value && !radarFeed.current.has(selectedCallsign.value)) {
      selectedCallsign.value = null;
    }
  }

  function select(callsign: string | null): void {
    selectedCallsign.value = callsign;
  }

  function reset(): void {
    radarFeed.previous.clear();
    radarFeed.current.clear();
    radarFeed.trails.clear();
    radarFeed.probe = null;
    selectedCallsign.value = null;
  }

  return { aircraft, lastUpdateAt, selectedCallsign, setAircraft, select, reset };
});
