<script setup lang="ts">
import type { SectorOverview } from '@towerwhisper/shared';
import { computed } from 'vue';
import { ago, alertLabel, clock, duration } from '../../utils/format';
import { replayOf } from '../../utils/replay';

/** One sector on the dashboard: who works it, its traffic and its live alerts. */
const props = defineProps<{ sector: SectorOverview; now: number }>();
defineEmits<{ watch: [sectorId: string]; replay: [sectorId: string] }>();

const MAX_ALERTS = 3;

const sorted = computed(() =>
  [...props.sector.activeAlerts].sort((a, b) =>
    a.severity !== b.severity
      ? a.severity === 'warning'
        ? -1
        : 1
      : b.raisedAt.localeCompare(a.raisedAt),
  ),
);
const level = computed(
  () => sorted.value[0]?.severity ?? (props.sector.controllers.length ? 'ok' : 'idle'),
);
const sessionAge = computed(() => clock((props.now - Date.parse(props.sector.startedAt)) / 1000));
</script>

<template>
  <article class="card" :class="level" :aria-label="sector.sector.name">
    <header class="head">
      <div class="names">
        <h3 class="name">{{ sector.sector.name }}</h3>
        <span class="mono sub">{{ sector.sector.airportIcao }} · SESSION {{ sessionAge }}</span>
      </div>
      <span v-if="sector.activeAlerts.length" class="count mono" :class="sorted[0].severity">
        {{ sector.activeAlerts.length }}
      </span>
    </header>

    <div class="staff">
      <template v-if="sector.controllers.length">
        <span v-for="c in sector.controllers" :key="c.id" class="controller">
          <span class="dot" aria-hidden="true" />
          {{ c.name }}
        </span>
      </template>
      <span v-else class="unstaffed mono">NO CONTROLLER SIGNED IN</span>
      <span v-if="sector.viewers" class="viewers mono">+{{ sector.viewers }} watching</span>
    </div>

    <ul class="alerts">
      <li v-for="a in sorted.slice(0, MAX_ALERTS)" :key="a.id">
        <RouterLink
          class="alert"
          :class="a.severity"
          :to="replayOf({ ...a, sectorId: sector.sector.id, sessionId: sector.sessionId })"
          :title="`Replay from just before this alert`"
        >
          <svg
            v-if="a.severity === 'warning'"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 3l10 18H2z" fill="currentColor" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="currentColor" />
          </svg>
          <span class="type mono">{{ alertLabel(a.type) }}</span>
          <span class="msg">{{ a.message }}</span>
          <span class="when mono">{{ ago(a.raisedAt, now) }}</span>
        </RouterLink>
      </li>
      <li v-if="sector.activeAlerts.length > MAX_ALERTS" class="more mono">
        +{{ sector.activeAlerts.length - MAX_ALERTS }} more
      </li>
      <li v-if="!sector.activeAlerts.length" class="quiet">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
          <path d="M8.5 12l2.5 2.5 4.5-5" />
        </svg>
        No active alert
      </li>
    </ul>

    <dl class="stats">
      <div>
        <dt>AIRCRAFT</dt>
        <dd class="mono">{{ sector.aircraftCount }}</dd>
      </div>
      <div>
        <dt>SESSION ALERTS</dt>
        <dd class="mono">{{ sector.sessionAlerts }}</dd>
      </div>
      <div>
        <dt>RESOLVED</dt>
        <dd class="mono">{{ sector.sessionResolved }}</dd>
      </div>
      <div>
        <dt>MEAN RESOLVE</dt>
        <dd class="mono">{{ duration(sector.meanResolveS) }}</dd>
      </div>
    </dl>

    <footer class="actions">
      <button type="button" class="ghost" @click="$emit('replay', sector.sector.id)">Replay</button>
      <button type="button" class="primary" @click="$emit('watch', sector.sector.id)">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 12l6-6" />
        </svg>
        Watch live
      </button>
    </footer>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-left: 4px solid var(--color-border-strong);
  border-radius: var(--radius-card);
}

.card.ok {
  border-left-color: var(--color-atc);
}

.card.caution {
  border-left-color: var(--color-caution);
}

.card.warning {
  border-left-color: var(--color-warning);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
}

.names {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub {
  font-size: 12px;
  color: var(--color-text-muted);
}

.count {
  min-width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 700;
  border-radius: 16px;
}

.count.caution {
  color: var(--color-caution);
  background: var(--color-caution-strong-bg);
}

.count.warning {
  color: var(--color-warning-text);
  background: var(--color-warning-strong-bg);
}

.staff {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  font-size: 14px;
}

.controller {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-ok);
}

.unstaffed {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--color-text-faint);
}

.viewers {
  font-size: 12px;
  color: var(--color-text-muted);
}

.alerts {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 96px;
}

.alert {
  text-decoration: none;
  display: grid;
  grid-template-columns: 16px auto 1fr auto;
  align-items: center;
  gap: var(--space-2);
  padding: 7px 10px;
  border-radius: var(--radius);
  font-size: 14px;
}

.alert.caution {
  color: var(--color-caution);
  background: var(--color-caution-bg);
}

.alert.warning {
  color: var(--color-warning-text);
  background: var(--color-warning-bg);
}

.alert:hover {
  outline: 1px solid currentColor;
}

.type {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.msg {
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.when {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.more {
  font-size: 12px;
  color: var(--color-text-muted);
  padding-left: 10px;
}

.quiet {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 7px 10px;
  font-size: 14px;
  color: var(--color-text-faint);
}

.stats {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: var(--border-width) solid var(--color-border);
}

.stats div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

dt {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-text-faint);
}

dd {
  margin: 0;
  font-size: 15px;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

.ghost,
.primary {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 var(--space-3);
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--radius);
}

.ghost {
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
}

.ghost:hover {
  border-color: var(--color-text-muted);
}

.primary {
  color: var(--color-atc);
  background: var(--color-atc-bg);
  border: var(--border-width) solid var(--color-atc);
}

.primary:hover {
  background: var(--color-atc-selected-bg);
}
</style>
