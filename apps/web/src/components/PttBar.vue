<script setup lang="ts">
import type { TransmissionResponse } from '@towerwhisper/shared';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMicrophone } from '../composables/useMicrophone';
import { useSocket } from '../composables/useSocket';
import { useCommsStore } from '../stores/useCommsStore';
import { useDemoStore } from '../stores/useDemoStore';
import { useTrafficStore } from '../stores/useTrafficStore';
import { api } from '../utils/api';

/** Height of every VU bar while nobody transmits (all equal). */
const IDLE_BAR_PX = 6;
const VU_MAX_PX = 38;
/** Bars from this index on are drawn amber (loud). */
const VU_LOUD_INDEX = 14;

const comms = useCommsStore();
const { pttState, pttMessage } = storeToRefs(comms);
const { session } = storeToRefs(useDemoStore());
const { selectedCallsign } = storeToRefs(useTrafficStore());
const { emitPtt } = useSocket();
const mic = useMicrophone();

/** Typed transmissions: forced in no-keys mode, or chosen when the microphone fails. */
const textMode = ref(false);
const typed = ref('');
const onAirSince = ref(0);
const onAirS = ref(0);
let onAirTimer: ReturnType<typeof setInterval> | undefined;

const noKeys = computed(() => session.value?.mode === 'no-keys');
const showText = computed(() => noKeys.value || textMode.value);
const transmitting = computed(() => pttState.value === 'transmitting');

const bars = computed(() =>
  mic.bands.value.map((level, i) => {
    const active = transmitting.value;
    const h = active ? Math.max(IDLE_BAR_PX, Math.round(level * VU_MAX_PX)) : IDLE_BAR_PX;
    const tone = !active ? 'idle' : i >= VU_LOUD_INDEX && level > 0.5 ? 'loud' : 'live';
    return { h, tone };
  }),
);

/** Short label in the status chip; details (errors) go on their own line inside the bar. */
const status = computed(() => {
  switch (pttState.value) {
    case 'transmitting':
      return `ON AIR ${onAirS.value.toFixed(1)} s`;
    case 'transcribing':
      return 'TRANSCRIBING';
    case 'error':
      return 'ERROR';
    default:
      return 'READY';
  }
});
const detail = computed(() => (pttState.value === 'error' ? pttMessage.value : null));

async function startPtt(): Promise<void> {
  if (pttState.value === 'transmitting' || pttState.value === 'transcribing') return;
  try {
    await mic.start();
  } catch {
    comms.setPttState('error', 'NO MICROPHONE · TYPE INSTEAD');
    textMode.value = true;
    return;
  }
  comms.setPttState('transmitting');
  emitPtt(true);
  onAirSince.value = performance.now();
  onAirS.value = 0;
  onAirTimer = setInterval(
    () => (onAirS.value = (performance.now() - onAirSince.value) / 1000),
    100,
  );
}

async function stopPtt(): Promise<void> {
  if (pttState.value !== 'transmitting') return;
  clearInterval(onAirTimer);
  emitPtt(false);
  const recording = await mic.stop();
  if (!recording) {
    comms.setPttState('ready'); // under 300 ms: discarded
    return;
  }
  comms.setPttState('transcribing');
  const form = new FormData();
  form.append('audio', recording.blob, 'ptt.webm');
  form.append('sessionId', session.value?.sessionId ?? '');
  form.append('durationMs', String(Math.round(recording.durationMs)));
  if (selectedCallsign.value) form.append('selectedCallsign', selectedCallsign.value);
  await send(() => api<TransmissionResponse>('POST', '/transmissions', form));
}

async function sendTyped(): Promise<void> {
  const text = typed.value.trim();
  if (!text) return;
  comms.setPttState('transcribing');
  const ok = await send(() =>
    api<TransmissionResponse>('POST', '/transmissions/text', {
      text,
      sessionId: session.value?.sessionId,
      selectedCallsign: selectedCallsign.value ?? undefined,
    }),
  );
  if (ok) typed.value = '';
}

async function send(request: () => Promise<TransmissionResponse>): Promise<boolean> {
  try {
    await request();
    comms.setPttState('ready');
    return true;
  } catch (error) {
    comms.setPttState('error', (error as Error).message.toUpperCase().slice(0, 48));
    setTimeout(() => pttState.value === 'error' && comms.setPttState('ready'), 4000);
    return false;
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.code !== 'Space' || event.repeat || showText.value || isTyping(event.target)) return;
  event.preventDefault();
  void startPtt();
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.code !== 'Space' || showText.value || isTyping(event.target)) return;
  event.preventDefault();
  void stopPtt();
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  clearInterval(onAirTimer);
});
</script>

<template>
  <div class="ptt-bar" :class="{ text: showText }">
    <div class="controls">
      <template v-if="!showText">
        <button
          type="button"
          class="talk"
          :class="{ on: transmitting }"
          aria-label="Push to talk (hold, or hold the space bar)"
          @pointerdown.prevent="startPtt"
          @pointerup="stopPtt"
          @pointerleave="stopPtt"
          @keydown.space.prevent
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
          <span>{{ transmitting ? 'TRANSMITTING' : 'HOLD SPACE TO TALK' }}</span>
        </button>
        <div class="vu" aria-hidden="true">
          <span
            v-for="(b, i) in bars"
            :key="i"
            class="bar"
            :class="b.tone"
            :style="{ height: `${b.h}px` }"
          />
        </div>
      </template>

      <form v-else class="typed" @submit.prevent="sendTyped">
        <label for="typed-transmission" class="visually-hidden">Instruction to transmit</label>
        <input
          id="typed-transmission"
          v-model="typed"
          class="mono"
          placeholder="Type an instruction…"
          autocomplete="off"
          spellcheck="false"
        />
        <button type="submit" class="send" :disabled="!typed.trim() || pttState === 'transcribing'">
          TRANSMIT
        </button>
      </form>

      <div class="status mono" :class="pttState" role="status" :title="detail ?? status">
        <svg
          v-if="pttState === 'transcribing'"
          class="spinner"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 3a9 9 0 1 1-9 9" />
        </svg>
        <span v-else class="dot" aria-hidden="true" />
        <span class="label">{{ status }}</span>
      </div>

      <button
        v-if="!noKeys"
        type="button"
        class="switch"
        :aria-label="showText ? 'Use the microphone' : 'Type instead of speaking'"
        :title="showText ? 'Use the microphone' : 'Type instead of speaking'"
        @click="textMode = !textMode"
      >
        <svg
          v-if="showText"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
        </svg>
        <svg
          v-else
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
        </svg>
      </button>
    </div>
    <p v-if="detail" class="detail mono" role="alert">{{ detail }}</p>
  </div>
</template>

<style scoped>
.ptt-bar {
  width: min(var(--ptt-width), calc(100% - 160px));
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-bar);
}

.ptt-bar.text {
  width: min(900px, calc(100% - 160px));
}

/* One row; every part either keeps a fixed size or shrinks, so nothing spills out. */
.controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.detail {
  margin: 0;
  padding: 6px 10px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-warning-text);
  background: var(--color-warning-bg);
  border-radius: var(--radius);
}

.talk {
  flex-shrink: 0;
  height: 56px;
  padding: 0 22px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 28px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text);
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  touch-action: none;
  user-select: none;
}

.talk.on {
  color: var(--color-on-transmit);
  background: var(--color-transmit);
  border-color: var(--color-warning);
  box-shadow: var(--shadow-transmit);
}

.vu {
  flex: 1 1 auto;
  min-width: 0;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.bar {
  flex: 1 1 0;
  max-width: 8px;
  min-width: 3px;
  border-radius: 2px;
  background: var(--color-border-chip);
  transition: height 60ms linear;
}

.bar.live {
  background: var(--color-atc);
}

.bar.loud {
  background: var(--color-caution);
}

.typed {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  gap: var(--space-2);
}

.typed input {
  flex-grow: 1;
  min-width: 0;
  height: 48px;
  padding: 0 var(--space-3);
  font-size: 15px;
  background: var(--color-bg);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.send {
  height: 48px;
  padding: 0 var(--space-5);
  border-radius: 24px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-atc);
  background: var(--color-atc-selected-bg);
  border: var(--border-width) solid var(--color-atc);
}

.send:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Status chip: fixed width, so READY / ON AIR 12.3 s / TRANSCRIBING / ERROR never move or overflow. */
.status {
  flex: 0 0 156px;
  height: 36px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: 18px;
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.status.ready {
  color: var(--color-ok);
}

.status.transmitting,
.status.error {
  color: var(--color-warning);
  background: var(--color-warning-bg);
  border-color: var(--color-warning);
}

.status.transcribing {
  color: var(--color-atc);
  background: var(--color-atc-bg);
  border-color: var(--color-atc);
}

.switch {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  background: transparent;
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: 18px;
}
</style>
