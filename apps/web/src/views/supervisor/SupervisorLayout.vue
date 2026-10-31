<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import UserMenu from '../../components/UserMenu.vue';
import { useNow } from '../../composables/useNow';
import { useSocket } from '../../composables/useSocket';
import { useSupervisorStore } from '../../stores/useSupervisorStore';
import { utcTime } from '../../utils/format';

/** The supervisor's frame: navigation, clock, live alert count. The live sector view is full screen. */
const route = useRoute();
const { connected } = useSocket();
const now = useNow();
const { activeAlerts } = storeToRefs(useSupervisorStore());

const fullScreen = computed(() => route.name === 'supervisor-live');
const warnings = computed(() => activeAlerts.value.filter((a) => a.severity === 'warning').length);

const tabs = [
  { name: 'supervisor', label: 'Overview' },
  { name: 'supervisor-alerts', label: 'Alerts' },
  { name: 'supervisor-replay', label: 'Replay' },
  { name: 'supervisor-users', label: 'Accounts' },
];
</script>

<template>
  <RouterView v-if="fullScreen" />
  <div v-else class="layout">
    <header class="bar">
      <div class="title">
        <span class="brand">TOWERWHISPER</span>
        <span class="role mono">SUPERVISOR</span>
      </div>
      <nav class="tabs" aria-label="Supervisor">
        <RouterLink
          v-for="t in tabs"
          :key="t.name"
          :to="{ name: t.name }"
          class="tab"
          :class="{ on: route.name === t.name }"
        >
          {{ t.label }}
        </RouterLink>
      </nav>
      <div class="spacer" />
      <span
        class="mono alerts"
        :class="{ warning: warnings > 0, caution: warnings === 0 && activeAlerts.length > 0 }"
        role="status"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l10 18H2z" fill="currentColor" />
        </svg>
        {{ activeAlerts.length }} ACTIVE ALERT{{ activeAlerts.length === 1 ? '' : 'S' }}
      </span>
      <span class="mono clock">{{ utcTime(now) }} UTC</span>
      <span class="connection" :class="{ down: !connected }" role="status">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <circle cx="5" cy="5" r="4" />
        </svg>
        {{ connected ? 'Live' : 'Disconnected' }}
      </span>
      <UserMenu />
    </header>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bar {
  flex: none;
  height: var(--topbar-height);
  padding: 0 var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-6);
  background: var(--color-panel);
  border-bottom: var(--border-width) solid var(--color-border);
}

.title {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.brand {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.role {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--color-atc);
}

.tabs {
  display: flex;
  height: 100%;
  gap: var(--space-1);
}

.tab {
  display: flex;
  align-items: center;
  padding: 0 var(--space-4);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
}

.tab:hover {
  color: var(--color-text);
}

.tab.on {
  color: var(--color-text);
  border-bottom-color: var(--color-atc);
}

.spacer {
  flex: 1;
}

.alerts {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius);
}

.alerts.caution {
  color: var(--color-caution);
  border-color: var(--color-caution);
  background: var(--color-caution-bg);
}

.alerts.warning {
  color: var(--color-warning-text);
  border-color: var(--color-warning);
  background: var(--color-warning-bg);
}

.clock {
  font-size: 16px;
  font-weight: 600;
}

.connection {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
  color: var(--color-text-muted);
  fill: var(--color-ok);
}

.connection.down {
  color: var(--color-warning);
  fill: var(--color-warning);
}

/* The only scrolling box of the page. Positioned, so absolutely placed content (the
   visually-hidden table labels, tooltips) stays inside it instead of stretching the body
   into a second scrollbar. */
.content {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
