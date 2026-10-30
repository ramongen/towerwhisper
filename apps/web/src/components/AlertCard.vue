<script setup lang="ts">
import type { Alert } from '@towerwhisper/shared';
import { ref } from 'vue';
import { useAlertStore } from '../stores/useAlertStore';
import { ago, alertLabel } from '../utils/format';

const props = defineProps<{ alert: Alert; now: number }>();
const alerts = useAlertStore();
const acking = ref(false);

async function ack(): Promise<void> {
  acking.value = true;
  try {
    await alerts.acknowledge(props.alert.id);
  } catch {
    // The alert may have cleared meanwhile; nothing to do.
  } finally {
    acking.value = false;
  }
}
</script>

<template>
  <article
    class="alert-card"
    :class="[alert.severity, { acked: alert.acknowledgedAt }]"
    role="alert"
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
      <span class="callsigns mono">{{ alert.callsigns.join(' · ') }}</span>
      <span class="spacer" />
      <span class="ago">{{ ago(alert.raisedAt, now) }}</span>
    </div>
    <p class="message">{{ alert.message }}</p>
    <div class="actions">
      <span v-if="alert.acknowledgedAt" class="acked-label">ACKNOWLEDGED</span>
      <button v-else type="button" class="ack" :disabled="acking" @click="ack">ACK</button>
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

.alert-card.acked {
  background: transparent;
  border-style: dashed;
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

.callsigns {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
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

.ack {
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

.acked-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}
</style>
