import type { CommsReadbackPayload, CommsTransmissionPayload } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** A comms entry plus the local time it arrived (the payloads carry no timestamp). */
export type CommsEntryData = (CommsTransmissionPayload | CommsReadbackPayload) & {
  receivedAt: number;
};
export type PttState = 'ready' | 'transmitting' | 'transcribing' | 'error';

/** Chronological ATC / pilot transmissions, the local PTT state and the shared frequency state. */
export const useCommsStore = defineStore('comms', () => {
  const entries = ref<CommsEntryData[]>([]);
  const pttState = ref<PttState>('ready');
  const pttMessage = ref<string | null>(null);
  const frequencyBusy = ref(false);

  function add(entry: CommsTransmissionPayload | CommsReadbackPayload): void {
    if (entries.value.some((e) => e.id === entry.id)) return; // replay after reconnect
    entries.value.push({ ...entry, receivedAt: Date.now() });
  }

  function setPttState(state: PttState, message: string | null = null): void {
    pttState.value = state;
    pttMessage.value = message;
  }

  function setFrequencyBusy(busy: boolean): void {
    frequencyBusy.value = busy;
  }

  function clear(): void {
    entries.value = [];
  }

  return {
    entries,
    pttState,
    pttMessage,
    frequencyBusy,
    add,
    setPttState,
    setFrequencyBusy,
    clear,
  };
});
