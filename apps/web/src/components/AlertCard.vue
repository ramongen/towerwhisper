<script setup lang="ts">
import type { Alert } from '@towerwhisper/shared';
import { computed } from 'vue';
import { ago, alertLabel, utcTime } from '../utils/format';

const props = defineProps<{ alert: Alert; now: number }>();
defineEmits<{ resolve: [alert: Alert]; select: [callsign: string] }>();

const ended = computed(() => !!props.alert.endedAt);
const outcome = computed(() =>
  props.alert.outcome === 'resolved' ? 'RESOLVED' : `CLEARED · ${props.alert.endReason ?? ''}`,
);
</script>

<template>
  <article
    class="alert-card"
    :class="[alert.severity, { ended }]"
    :role="ended ? undefined : 'alert'"
    :aria-label="`${alert.severity}: ${alertLabel(alert.type)} ${alert.callsigns.join(' ')}`"
  >
    <div class="head">
      <svg
        v-if="alert.severity === 'warning'"
        width="20"
        height="20"
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
        width="20"
        height="20"
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
      <span class="type mono">{{ alertLabel(alert.type) }}</span>
      <button
        v-for="cs in alert.callsigns"
        :key="cs"
        type="button"
        class="callsign mono"
        :title="`Select ${cs} on the radar`"
        @click="$emit('select', cs)"
      >
        {{ cs }}
      </button>
      <span class="spacer" />
      <span class="ago">{{ ended ? utcTime(alert.endedAt!) : ago(alert.raisedAt, now) }}</span>
    </div>
    <p class="message">{{ alert.message }}</p>
    <div class="actions">
      <span v-if="ended" class="outcome mono" :class="alert.outcome">
        <svg
          v-if="alert.outcome === 'resolved'"
          width="14"
          height="14"
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
        {{ outcome }}
      </span>
      <button v-else type="button" class="resolve" @click="$emit('resolve', alert)">RESOLVE</button>
    </div>
  </article>
</template>

<style scoped>
.alert-card {
  padding: 14px var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-radius: var(--radius-card);
  border: var(--border-width) solid;
}

.alert-card.warning {
  color: var(--color-warning);
  background: var(--color-warning-bg);
  border-color: var(--color-warning);
}

.alert-card.caution {
  color: var(--color-caution);
  background: var(--color-caution-bg);
  border-color: var(--color-caution);
}

/* History: same card, quiet. */
.alert-card.ended {
  padding: 10px 14px;
  color: var(--color-text-muted);
  background: transparent;
  border-color: var(--color-border-strong);
  border-style: dashed;
}

.alert-card.ended .message {
  font-size: 15px;
  color: var(--color-text-secondary);
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.type {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.callsign {
  padding: 0 4px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  background: transparent;
  border: var(--border-width) solid transparent;
  border-radius: var(--radius-sm);
}

.callsign:hover {
  border-color: var(--color-atc);
  color: var(--color-atc);
}

.spacer {
  flex-grow: 1;
}

.ago {
  font-size: 13px;
  color: var(--color-text-muted);
}

.message {
  margin: 0;
  font-size: var(--font-size-alert);
  line-height: 1.45;
  color: var(--color-text);
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.resolve {
  height: 36px;
  padding: 0 18px;
  border-radius: var(--radius);
  background: transparent;
  border: var(--border-width) solid currentColor;
  color: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.outcome {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.outcome.resolved {
  color: var(--color-ok);
}
</style>
