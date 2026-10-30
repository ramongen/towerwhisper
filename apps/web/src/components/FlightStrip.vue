<script setup lang="ts">
import type { Aircraft, FaultConfig } from '@towerwhisper/shared';
import { computed } from 'vue';
import type { AlertLevel } from '../stores/useAlertStore';
import { formatAge, heading, level } from '../utils/format';

const props = defineProps<{
  aircraft: Aircraft;
  selected: boolean;
  alertLevel: AlertLevel | undefined;
  limits: FaultConfig['commsLimits'];
}>();
defineEmits<{ select: [callsign: string] }>();

const levels = computed(() => {
  const a = props.aircraft;
  const target = a.target.altitudeFt ?? a.altitudeFt;
  const same = Math.abs(target - a.altitudeFt) < 100;
  return `${level(a.altitudeFt)} ${same ? '=' : '→'} ${level(target)}`;
});

const headingText = computed(() => {
  // Actual heading, then the assigned one while the aircraft is still turning to it.
  const a = props.aircraft;
  const t = a.target;
  const now = heading(a.headingDeg);
  if (t.headingDeg === undefined || heading(t.headingDeg) === now) return now;
  const turn = t.turnDir === 'left' ? 'L' : t.turnDir === 'right' ? 'R' : '';
  return `${now}→${heading(t.headingDeg)}${turn}`;
});

const approach = computed(() => {
  const app = props.aircraft.target.approach;
  return app ? `ILS ${app.runway}` : '—';
});

const commsLevel = computed(() => {
  const age = props.aircraft.commsAgeS;
  if (age >= props.limits.warningS) return 'warning';
  if (age >= props.limits.cautionS) return 'caution';
  return 'ok';
});

/** The top edge shows the worst state: an alert, else the comms timer. */
const edge = computed(
  () => props.alertLevel ?? (commsLevel.value === 'ok' ? null : commsLevel.value),
);
</script>

<template>
  <button
    type="button"
    class="strip"
    :class="{ selected }"
    :aria-pressed="selected"
    :aria-label="`Flight strip ${aircraft.callsign}`"
    @click="$emit('select', aircraft.callsign)"
  >
    <span class="edge" :class="edge ?? ''" />
    <span class="body">
      <span class="row head">
        <span class="callsign">{{ aircraft.callsign }}</span>
        <span class="type">{{ aircraft.type }}</span>
      </span>
      <span class="levels">{{ levels }}</span>
      <span class="row data">
        <span>HDG {{ headingText }}</span>
        <span>SPD {{ aircraft.speedKt }}</span>
        <span>{{ approach }}</span>
      </span>
      <span class="row last-call">
        <span class="label">LAST CALL</span>
        <span class="age" :class="commsLevel">{{ formatAge(aircraft.commsAgeS) }}</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.strip {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  text-align: left;
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-strip);
  overflow: hidden;
  font-family: var(--font-data);
}

.strip.selected {
  border-color: var(--color-atc);
}

.edge {
  height: 4px;
  background: var(--color-border-chip);
}

.edge.caution {
  background: var(--color-caution);
}

.edge.warning {
  background: var(--color-warning);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
}

.row {
  display: flex;
  align-items: baseline;
}

.head {
  justify-content: space-between;
}

.callsign {
  font-size: 18px;
  font-weight: 700;
}

.type {
  font-size: 14px;
  color: var(--color-text-muted);
}

.levels {
  font-size: 16px;
}

.data {
  gap: 14px;
  font-size: 14px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.last-call {
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
}

.label {
  color: var(--color-text-muted);
}

.age {
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

.age.caution {
  color: var(--color-caution);
  background: var(--color-caution-strong-bg);
}

.age.warning {
  color: var(--color-warning);
  background: var(--color-warning-strong-bg);
}
</style>
