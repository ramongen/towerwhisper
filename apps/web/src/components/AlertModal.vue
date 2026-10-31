<script setup lang="ts">
import type { Alert } from '@towerwhisper/shared';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAlertStore } from '../stores/useAlertStore';
import { useTrafficStore } from '../stores/useTrafficStore';
import { alertLabel } from '../utils/format';

/** Alerts raised before the page loaded (sent again after a refresh) do not pop up. */
const FRESH_ALERT_MS = 5000;

const { active } = storeToRefs(useAlertStore());
const traffic = useTrafficStore();

/** New alerts waiting to be shown, oldest first. */
const queue = ref<string[]>([]);
const seen = new Set<string>();

watch(
  active,
  (list) => {
    const activeIds = new Set(list.map((a) => a.id));
    queue.value = queue.value.filter((id) => activeIds.has(id)); // ended meanwhile: skip it
    for (const alert of [...list].reverse()) {
      if (seen.has(alert.id)) continue;
      seen.add(alert.id);
      if (Date.now() - Date.parse(alert.raisedAt) < FRESH_ALERT_MS) queue.value.push(alert.id);
    }
  },
  { deep: true, immediate: true },
);

const current = computed<Alert | null>(
  () => active.value.find((a) => a.id === queue.value[0]) ?? null,
);
const waiting = computed(() => queue.value.length - 1);

function close(): void {
  queue.value = queue.value.slice(1);
}

function selectAircraft(): void {
  if (current.value) traffic.select(current.value.callsigns[0]);
  close();
}

function onKey(event: KeyboardEvent): void {
  if (current.value && event.key === 'Escape') close();
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="current" class="backdrop" @click.self="close">
    <div
      class="modal"
      :class="current.severity"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="new-alert-title"
      aria-describedby="new-alert-message"
    >
      <div class="head">
        <svg
          v-if="current.severity === 'warning'"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linejoin="round"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 3l10 18H2z" />
          <line x1="12" y1="10" x2="12" y2="14" />
          <line x1="12" y1="17.5" x2="12" y2="17.6" />
        </svg>
        <svg
          v-else
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="7.5" x2="12" y2="13" />
          <line x1="12" y1="16.5" x2="12" y2="16.6" />
        </svg>
        <div class="titles">
          <span class="label mono"
            >NEW {{ current.severity === 'warning' ? 'WARNING' : 'CAUTION' }}</span
          >
          <h2 id="new-alert-title" class="mono">{{ alertLabel(current.type) }}</h2>
        </div>
        <span class="callsigns mono">{{ current.callsigns.join(' · ') }}</span>
      </div>
      <p id="new-alert-message" class="message">{{ current.message }}</p>
      <div class="actions">
        <span v-if="waiting > 0" class="more mono">+{{ waiting }} more</span>
        <button type="button" class="secondary" @click="close">CLOSE</button>
        <button type="button" class="primary" autofocus @click="selectAircraft">
          SELECT {{ current.callsigns[0] }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 18vh;
  background: rgba(4, 8, 13, 0.55);
}

.modal {
  width: 600px;
  max-width: calc(100% - 32px);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: var(--color-panel);
  border: 2px solid currentColor;
  border-radius: var(--radius-dialog);
}

.modal.warning {
  color: var(--color-warning);
  box-shadow: 0 0 48px rgba(255, 93, 93, 0.35);
}

.modal.caution {
  color: var(--color-caution);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-grow: 1;
}

.label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

h2 {
  margin: 0;
  font-size: 24px;
  letter-spacing: 0.04em;
}

.callsigns {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}

.message {
  margin: 0;
  font-size: 19px;
  line-height: 1.45;
  color: var(--color-text);
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
}

.more {
  margin-right: auto;
  font-size: 13px;
  color: var(--color-text-muted);
}

button {
  min-height: 48px;
  padding: 0 var(--space-5);
  border-radius: var(--radius);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.secondary {
  color: var(--color-text-secondary);
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
}

.primary {
  color: var(--color-atc);
  background: var(--color-atc-selected-bg);
  border: var(--border-width) solid var(--color-atc);
}
</style>
