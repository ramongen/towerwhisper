import type { CommsReadbackPayload, CommsTransmissionPayload } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type CommsEntryData = CommsTransmissionPayload | CommsReadbackPayload;
export type PttState = 'ready' | 'transmitting' | 'transcribing' | 'error';

/** Chronological ATC / pilot transmissions and the local PTT state. */
export const useCommsStore = defineStore('comms', () => {
  const entries = ref<CommsEntryData[]>([]);
  const pttState = ref<PttState>('ready');

  function add(entry: CommsEntryData): void {
    entries.value.push(entry);
  }

  function setPttState(state: PttState): void {
    pttState.value = state;
  }

  return { entries, pttState, add, setPttState };
});
