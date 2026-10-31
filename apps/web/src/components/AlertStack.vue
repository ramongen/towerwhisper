<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { watch } from 'vue';
import { playAlertSound } from '../composables/useAlertSound';
import { useNow } from '../composables/useNow';
import { useAlertStore } from '../stores/useAlertStore';
import AlertCard from './AlertCard.vue';

const { sorted, active } = storeToRefs(useAlertStore());
const now = useNow();

/** An alert older than this when first seen was raised before the page loaded. */
const FRESH_ALERT_MS = 5000;

// A sound when an alert appears or escalates (caution -> warning).
const heard = new Map<string, string>();
watch(
  active,
  (list) => {
    for (const alert of list) {
      const before = heard.get(alert.id);
      // New and just raised, or escalated while on screen. Alerts that were already active
      // when the page loaded (sent again after a refresh) stay silent.
      const fresh = Date.now() - Date.parse(alert.raisedAt) < FRESH_ALERT_MS;
      const sound = before === undefined ? fresh : before !== alert.severity;
      if (sound && !alert.acknowledgedAt) playAlertSound(alert.severity);
      heard.set(alert.id, alert.severity);
    }
  },
  { deep: true },
);
</script>

<template>
  <section class="alert-stack" aria-label="Alerts">
    <div class="header">
      <h2 class="section-title">ALERTS</h2>
      <span class="count">{{ sorted.length ? `${sorted.length} active` : 'None active' }}</span>
    </div>
    <div v-if="sorted.length === 0" class="empty">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
        <path d="M8.5 12l2.5 2.5 4.5-5" />
      </svg>
      <span>All readbacks and manoeuvres conform</span>
    </div>
    <div v-else class="list">
      <AlertCard v-for="a in sorted" :key="a.id" :alert="a" :now="now" />
    </div>
  </section>
</template>

<style scoped>
.alert-stack {
  padding: var(--space-4) var(--space-5);
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

.count {
  font-size: 13px;
  color: var(--color-text-muted);
}

.empty {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: var(--border-width) dashed var(--color-border-strong);
  border-radius: var(--radius-card);
  color: var(--color-text-muted);
  font-size: 16px;
}

.list {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: auto;
}
</style>
