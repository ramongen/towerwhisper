<script setup lang="ts">
import type { Alert } from '@towerwhisper/shared';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { playAlertSound } from '../composables/useAlertSound';
import { useNow } from '../composables/useNow';
import { useAlertStore } from '../stores/useAlertStore';
import { useTrafficStore } from '../stores/useTrafficStore';
import { alertLabel } from '../utils/format';
import AlertCard from './AlertCard.vue';
import ConfirmDialog from './ConfirmDialog.vue';

/** An alert older than this when first seen was raised before the page loaded. */
const FRESH_ALERT_MS = 5000;

const alerts = useAlertStore();
const { sorted, active, pastNewestFirst } = storeToRefs(alerts);
const traffic = useTrafficStore();
const liveNow = useNow();
/** The replayed moment in a replay, the clock otherwise. */
const now = computed(() => alerts.replayNow ?? liveNow.value);

const tab = ref<'active' | 'history'>('active');
const confirming = ref<Alert | null>(null);
const resolving = ref(false);

async function confirmResolve(): Promise<void> {
  if (!confirming.value) return;
  resolving.value = true;
  try {
    await alerts.resolve(confirming.value.id);
  } catch {
    // Already cleared by the system meanwhile: it is in the history either way.
  } finally {
    resolving.value = false;
    confirming.value = null;
  }
}

// A sound when an alert appears or escalates (caution -> warning).
const heard = new Map<string, string>();
watch(
  active,
  (list) => {
    for (const alert of list) {
      const before = heard.get(alert.id);
      // In a replay the player sounds the alerts as their moment passes.
      if (alerts.replayNow !== null) {
        heard.set(alert.id, alert.severity);
        continue;
      }
      // New and just raised, or escalated while on screen. Alerts that were already active
      // when the page loaded (sent again after a refresh) stay silent.
      const fresh = Date.now() - Date.parse(alert.raisedAt) < FRESH_ALERT_MS;
      const sound = before === undefined ? fresh : before !== alert.severity;
      if (sound) playAlertSound(alert.severity);
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
      <div class="tabs mono" role="tablist" aria-label="Alert list">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'active'"
          :class="{ on: tab === 'active' }"
          @click="tab = 'active'"
        >
          ACTIVE <span class="n" :class="{ hot: sorted.length > 0 }">{{ sorted.length }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'history'"
          :class="{ on: tab === 'history' }"
          @click="tab = 'history'"
        >
          HISTORY <span class="n">{{ pastNewestFirst.length }}</span>
        </button>
      </div>
    </div>

    <template v-if="tab === 'active'">
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
        <AlertCard
          v-for="a in sorted"
          :key="a.id"
          :alert="a"
          :now="now"
          @resolve="confirming = $event"
          @select="traffic.select($event)"
        />
      </div>
    </template>

    <template v-else>
      <p v-if="pastNewestFirst.length === 0" class="empty quiet">
        No alert has ended in this session yet.
      </p>
      <div v-else class="list">
        <AlertCard
          v-for="a in pastNewestFirst"
          :key="a.id"
          :alert="a"
          :now="now"
          @select="traffic.select($event)"
        />
      </div>
    </template>

    <ConfirmDialog
      v-if="confirming"
      title="Resolve this alert?"
      :message="`${alertLabel(confirming.type)} · ${confirming.callsigns.join(', ')}: ${confirming.message}`"
      confirm-label="RESOLVE"
      :busy="resolving"
      @confirm="confirmResolve"
      @cancel="confirming = null"
    />
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

.tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius);
}

.tabs button {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  background: transparent;
  border: var(--border-width) solid transparent;
  border-radius: var(--radius-sm);
}

.tabs button.on {
  color: var(--color-atc);
  background: var(--color-atc-selected-bg);
  border-color: var(--color-atc);
}

.n {
  margin-left: 4px;
}

.n.hot {
  color: var(--color-warning);
}

.empty {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin: 0;
  border: var(--border-width) dashed var(--color-border-strong);
  border-radius: var(--radius-card);
  color: var(--color-text-muted);
  font-size: 16px;
}

.empty.quiet {
  font-size: 15px;
}

.list {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: auto;
}
</style>
