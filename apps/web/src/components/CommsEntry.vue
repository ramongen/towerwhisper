<script setup lang="ts">
import type { Clearance } from '@towerwhisper/shared';
import { computed } from 'vue';
import type { CommsEntryData } from '../stores/useCommsStore';
import { chips, utcTime } from '../utils/format';
import { differingValues, highlight } from '../utils/highlight';
import InstructionChip from './InstructionChip.vue';

const props = defineProps<{
  entry: CommsEntryData;
  /** For a pilot readback: the instruction it answers (to mark wrong values in red). */
  instruction: Clearance | null;
}>();
defineEmits<{ play: [entry: CommsEntryData] }>();

const isPilot = computed(() => props.entry.speaker === 'pilot');
const callsign = computed(() =>
  props.entry.speaker === 'pilot' ? props.entry.callsign : (props.entry.clearance?.callsign ?? '—'),
);
const check = computed(() => (props.entry.speaker === 'pilot' ? props.entry.check : null));
/** Pilot audio (TTS), or the controller's own PTT recording. */
const audioUrl = computed(() => props.entry.audioUrl ?? null);

const diff = computed(() =>
  isPilot.value
    ? differingValues(props.instruction, props.entry.clearance)
    : { values: new Set<string>(), fields: new Set<string>() },
);
const parts = computed(() => highlight(props.entry.transcript, diff.value.values));
const chipList = computed(() => chips(props.entry.clearance));
</script>

<template>
  <article class="entry" :aria-label="`${isPilot ? 'Pilot' : 'Controller'} ${callsign}`">
    <div class="head">
      <span class="tag mono" :class="isPilot ? 'pilot' : 'atc'">{{
        isPilot ? 'PILOT' : 'ATC'
      }}</span>
      <span class="callsign mono">{{ callsign }}</span>
      <span class="time mono">{{ utcTime(entry.receivedAt) }}</span>
      <span class="spacer" />
      <span v-if="check === 'ok'" class="status ok">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12l5 5 9-10" />
        </svg>
        READBACK OK
      </span>
      <span v-else-if="check === 'mismatch'" class="status bad">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
        MISMATCH
      </span>
      <span v-else-if="check === 'incomplete'" class="status half">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.5" />
          <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
        </svg>
        INCOMPLETE
      </span>
      <button
        v-if="isPilot || audioUrl"
        type="button"
        class="play"
        :aria-label="
          isPilot ? `Play pilot audio from ${callsign}` : 'Play the controller recording'
        "
        @click="$emit('play', entry)"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 1l7 4-7 4z" fill="currentColor" />
        </svg>
      </button>
    </div>

    <p class="text">
      <span v-for="(p, i) in parts" :key="i" :class="['part', p.kind, isPilot ? 'pilot' : 'atc']">{{
        p.text
      }}</span>
    </p>

    <div class="chips">
      <InstructionChip
        v-for="c in chipList"
        :key="c.key"
        :text="c.text"
        :bad="diff.fields.has(c.key)"
      />
      <InstructionChip
        v-if="!entry.clearance && !isPilot"
        text="NOT UNDERSTOOD · SAY AGAIN"
        muted
      />
      <InstructionChip v-if="entry.clearance?.parsePath === 'llm'" text="AI PARSE" muted />
      <InstructionChip v-if="isPilot && !audioUrl" text="TEXT ONLY" muted />
    </div>
  </article>
</template>

<style scoped>
.entry {
  padding: var(--space-3) 14px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-card);
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tag {
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.tag.atc {
  color: var(--color-atc);
  background: var(--color-atc-bg);
}

.tag.pilot {
  color: var(--color-pilot);
  background: var(--color-pilot-bg);
}

.callsign {
  font-size: 15px;
  font-weight: 700;
}

.time {
  font-size: 13px;
  color: var(--color-text-muted);
}

.spacer {
  flex-grow: 1;
}

.status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
}

.status.ok {
  color: var(--color-ok);
}

.status.bad {
  color: var(--color-warning);
}

.status.half {
  color: var(--color-caution);
}

.play {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-chip);
  border-radius: 14px;
  color: var(--color-text-secondary);
}

.text {
  margin: 0;
  font-size: 15px;
  line-height: 1.55;
  color: var(--color-text-secondary);
}

.part.key,
.part.bad {
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  font-family: var(--font-data);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.part.key.atc {
  background: var(--color-atc-bg);
}

.part.key.pilot {
  background: var(--color-pilot-key-bg);
}

.part.bad {
  font-weight: 700;
  color: var(--color-warning-text);
  background: var(--color-warning-strong-bg);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chips:empty {
  display: none;
}
</style>
