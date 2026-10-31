import type { CommsReadbackPayload, CommsTransmissionPayload } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** A comms entry, its time, and whether it came from the history replayed on connect. */
export type CommsEntryData = (CommsTransmissionPayload | CommsReadbackPayload) & {
  receivedAt: number;
  /** true for entries from comms:history: shown, never played again. */
  replayed: boolean;
};
export type PttState = 'ready' | 'transmitting' | 'transcribing' | 'error';

/** Chronological ATC / pilot transmissions, the local PTT state and the shared frequency state. */
export const useCommsStore = defineStore('comms', () => {
  const entries = ref<CommsEntryData[]>([]);
  const pttState = ref<PttState>('ready');
  const pttMessage = ref<string | null>(null);
  const frequencyBusy = ref(false);

  function add(entry: CommsTransmissionPayload | CommsReadbackPayload, replayed = false): void {
    if (entries.value.some((e) => e.id === entry.id)) return; // already shown before a reconnect
    entries.value.push({ ...entry, receivedAt: Date.parse(entry.at) || Date.now(), replayed });
  }

  /** The recent comms sent on (re)connect, oldest first. */
  function addHistory(history: (CommsTransmissionPayload | CommsReadbackPayload)[]): void {
    for (const entry of history) add(entry, true);
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
    addHistory,
    setPttState,
    setFrequencyBusy,
    clear,
  };
});
