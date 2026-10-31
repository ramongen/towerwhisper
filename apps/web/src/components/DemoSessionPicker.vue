<script setup lang="ts">
import type { DemoSessionInfo } from '@towerwhisper/shared';
import { computed, ref } from 'vue';

/** The chosen session, folded; tap "Change" for every sector's session and who is in it. */
const props = defineProps<{ sessions: DemoSessionInfo[]; selected: string | null }>();
const emit = defineEmits<{ pick: [sectorId: string] }>();

const expanded = ref(false);
const shown = computed(() =>
  expanded.value ? props.sessions : props.sessions.filter((s) => s.sector.id === props.selected),
);

function choose(id: string): void {
  emit('pick', id);
  expanded.value = false;
}
</script>

<template>
  <section class="picker" aria-labelledby="picker-title">
    <div class="head">
      <h2 id="picker-title" class="section-title">SESSION</h2>
      <button type="button" class="change" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ expanded ? 'Done' : 'Change' }}
      </button>
    </div>
    <p v-if="expanded" class="note">
      The panel drives one sector's live session. Pick the controller you demo with.
    </p>
    <div class="list" role="radiogroup" aria-labelledby="picker-title">
      <button
        v-for="s in shown"
        :key="s.sector.id"
        type="button"
        role="radio"
        class="session"
        :class="{ on: s.sector.id === selected, staffed: s.users.some((u) => u.role === 'atc') }"
        :aria-checked="s.sector.id === selected"
        @click="choose(s.sector.id)"
      >
        <span class="radio" aria-hidden="true" />
        <span class="body">
          <span class="row">
            <span class="name">{{ s.sector.name }}</span>
            <span class="icao mono">{{ s.sector.airportIcao }}</span>
          </span>
          <span v-if="s.users.length" class="users">
            <span v-for="u in s.users" :key="u.id" class="user">
              <span class="badge mono" :class="u.role">{{ u.role === 'atc' ? 'ATC' : 'SUP' }}</span>
              {{ u.name }}
            </span>
          </span>
          <span v-else class="users empty">No one signed in</span>
          <span class="meta mono">
            {{ s.aircraftCount }} AIRCRAFT ·
            <span :class="{ alerting: s.activeAlerts > 0 }"
              >{{ s.activeAlerts }} ACTIVE ALERTS</span
            >
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.picker {
  padding: var(--space-5) var(--space-4) 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.change {
  height: 30px;
  padding: 0 var(--space-3);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-atc);
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.picker .section-title {
  font-size: 12px;
}

.note {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.session {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3);
  text-align: left;
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-card);
}

.session.on {
  border-color: var(--color-atc);
  background: var(--color-atc-selected-bg);
}

.radio {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border: 2px solid var(--color-border-control);
  border-radius: 50%;
}

.session.on .radio {
  border-color: var(--color-atc);
  box-shadow: inset 0 0 0 4px var(--color-atc-selected-bg);
  background: var(--color-atc);
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}

.name {
  font-size: 15px;
  font-weight: 600;
}

.icao {
  font-size: 13px;
  color: var(--color-text-muted);
}

.users {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.users.empty {
  color: var(--color-text-faint);
}

.user {
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge {
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  border: var(--border-width) solid var(--color-border-control);
}

.badge.atc {
  color: var(--color-atc);
  border-color: var(--color-atc);
}

.meta {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--color-text-faint);
}

.alerting {
  color: var(--color-caution);
}
</style>
