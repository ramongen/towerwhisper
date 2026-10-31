<script setup lang="ts">
import type { Clearance } from '@towerwhisper/shared';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useNow } from '../composables/useNow';
import { useRadioVoice } from '../composables/useRadioVoice';
import { useCommsStore, type CommsEntryData } from '../stores/useCommsStore';
import { useDemoStore } from '../stores/useDemoStore';
import { useSectorStore } from '../stores/useSectorStore';
import { useTrafficStore } from '../stores/useTrafficStore';
import CommsEntry from './CommsEntry.vue';

/** A readback is shown as pending for this long; NO_RESPONSE comes from the backend at 8 s. */
const PENDING_SHOW_MS = 10_000;

const { entries } = storeToRefs(useCommsStore());
const { faults } = storeToRefs(useDemoStore());
const { aircraft } = storeToRefs(useTrafficStore());
const { readonly } = storeToRefs(useSectorStore());
/** An example with one of this sector's own callsigns. */
const example = computed(() => {
  const first = aircraft.value[0];
  return first
    ? `${first.telephony}, descend altitude 4000 feet`
    : 'TAROM 301, descend altitude 3000 feet';
});
const voice = useRadioVoice();
const now = useNow(500);

/** For each pilot entry, the instruction it answers: the latest earlier ATC clearance for that aircraft. */
const instructionFor = computed(() => {
  const map = new Map<string, Clearance | null>();
  let latest: Clearance | null = null;
  const byCallsign = new Map<string, Clearance>();
  for (const e of entries.value) {
    if (e.speaker === 'atc' && e.clearance) {
      byCallsign.set(e.clearance.callsign, e.clearance);
      latest = e.clearance;
    } else if (e.speaker === 'pilot') {
      map.set(e.id, byCallsign.get(e.callsign) ?? latest);
    }
  }
  return map;
});

/** ATC instructions still waiting for their readback. */
const pending = computed(() => {
  const out: { id: string; telephony: string }[] = [];
  entries.value.forEach((e, i) => {
    if (e.speaker !== 'atc' || !e.clearance || now.value - e.receivedAt > PENDING_SHOW_MS) return;
    // A readback answers it; a call the pilot starts (landing request) does not.
    const answered = entries.value
      .slice(i + 1)
      .some((later) => later.speaker === 'pilot' && later.check !== null);
    if (answered) return;
    const cs = e.clearance.callsign;
    out.push({
      id: e.id,
      telephony: aircraft.value.find((a) => a.callsign === cs)?.telephony ?? cs,
    });
  });
  return out;
});

const newestFirst = computed(() => [...entries.value].reverse());

function play(entry: CommsEntryData): void {
  // A typed controller transmission has no recording: nothing to play.
  if (entry.speaker === 'atc' && !entry.audioUrl) return;
  void voice.play(entry.audioUrl ?? null, entry.transcript, faults.value?.radioNoise ?? 0.3);
}
</script>

<template>
  <section class="comms-panel" aria-label="Communications">
    <div class="header">
      <h2 class="section-title">COMMUNICATIONS</h2>
      <span class="hint">Newest first</span>
    </div>
    <div class="list">
      <article v-for="p in pending" :key="`pending-${p.id}`" class="pending">
        <svg
          class="spinner"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 3a9 9 0 1 1-9 9" />
        </svg>
        Awaiting readback from {{ p.telephony }}…
      </article>
      <CommsEntry
        v-for="e in newestFirst"
        :key="e.id"
        :entry="e"
        :instruction="instructionFor.get(e.id) ?? null"
        @play="play"
      />
      <p v-if="entries.length === 0 && readonly" class="empty">
        No transmission on this frequency yet in this session.
      </p>
      <p v-else-if="entries.length === 0" class="empty">
        Hold <kbd>SPACE</kbd> and speak an instruction, e.g. “{{ example }}”.
      </p>
    </div>
  </section>
</template>

<style scoped>
.comms-panel {
  padding: var(--space-4) var(--space-5) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hint {
  font-size: 13px;
  color: var(--color-text-muted);
}

.list {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-bottom: var(--space-4);
}

.pending {
  padding: var(--space-3) 14px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 15px;
  color: var(--color-text-muted);
  background: var(--color-panel-raised);
  border: var(--border-width) dashed var(--color-border-chip);
  border-radius: var(--radius-card);
  stroke: var(--color-pilot);
}

.empty {
  margin: var(--space-4) 0;
  font-size: 15px;
  color: var(--color-text-muted);
}

kbd {
  font-family: var(--font-data);
  font-size: 13px;
  padding: 1px 6px;
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius-sm);
}
</style>
