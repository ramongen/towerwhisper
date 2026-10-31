<script setup lang="ts">
import type { AircraftDetails } from '@towerwhisper/shared';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { radarFeed, useTrafficStore } from '../stores/useTrafficStore';
import { api } from '../utils/api';
import { heading } from '../utils/format';

const props = defineProps<{ callsign: string }>();
defineEmits<{ close: [] }>();

/** Route progress and runway advice change slowly; refresh at this pace. */
const REFRESH_MS = 5000;

const { aircraft } = storeToRefs(useTrafficStore());
const details = ref<AircraftDetails | null>(null);
const error = ref<string | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;

async function load(): Promise<void> {
  try {
    const d = await api<AircraftDetails>('GET', `/aircraft/${props.callsign}`);
    details.value = d;
    error.value = null;
    // The radar draws the selected aircraft's route from this plain object.
    radarFeed.route = {
      callsign: d.callsign,
      filed: d.flightPlan?.route ?? [],
      remaining: d.remainingRoute,
    };
  } catch (e) {
    error.value = (e as Error).message;
  }
}

watch(
  () => props.callsign,
  () => {
    details.value = null;
    clearInterval(timer);
    void load();
    timer = setInterval(() => void load(), REFRESH_MS);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearInterval(timer);
  radarFeed.route = null;
});

const live = computed(() => aircraft.value.find((a) => a.callsign === props.callsign) ?? null);
const kg = (n: number) => `${n.toLocaleString('en-US')} kg`;

const weights = computed(() => {
  const d = details.value;
  if (!d?.type) return [];
  const declared = d.flightPlan?.declaredLandingWeightKg;
  return [
    { label: 'MTOW', value: kg(d.type.mtowKg) },
    { label: 'MLW', value: kg(d.type.mlwKg) },
    {
      label: 'DECLARED LDG',
      value: declared ? kg(declared) : '—',
      sub: declared ? `${Math.round((declared / d.type.mlwKg) * 100)}% of MLW` : '',
    },
  ];
});

const state = computed(() => {
  const a = live.value;
  if (!a) return [];
  const t = a.target;
  const turn = t.turnDir === 'left' ? ' L' : t.turnDir === 'right' ? ' R' : '';
  const vs = a.verticalSpeedFpm;
  return [
    {
      label: 'ALT',
      value: `${a.altitudeFt.toLocaleString('en-US')} ft`,
      to:
        t.altitudeFt !== undefined && Math.abs(t.altitudeFt - a.altitudeFt) >= 100
          ? `→ ${t.altitudeFt}`
          : '',
    },
    {
      label: 'HDG',
      value: `${heading(a.headingDeg)}°`,
      to: t.headingDeg !== undefined ? `→ ${heading(t.headingDeg)}${turn}` : '',
    },
    {
      label: 'SPD',
      value: `${a.speedKt} kt`,
      to: t.speedKt !== undefined && t.speedKt !== a.speedKt ? `→ ${t.speedKt}` : '',
    },
    { label: 'V/S', value: vs === 0 ? 'level' : `${vs > 0 ? '+' : ''}${vs} fpm`, to: '' },
  ];
});

const navigation = computed(() => {
  const a = live.value;
  if (!a) return '';
  if (a.target.approach && a.target.landingCleared) {
    return `CLEARED TO LAND ${a.target.approach.runway}`;
  }
  if (a.target.approach) return `${a.target.approach.type} ${a.target.approach.runway}`;
  if (a.holding) return `HOLDING ${a.nextWaypoint}`;
  if (a.nextWaypoint) return `OWN NAV → ${a.nextWaypoint}`;
  return 'ON VECTORS';
});

const route = computed(() => {
  const d = details.value;
  if (!d?.flightPlan) return [];
  const ahead = new Set(d.remainingRoute.map((w) => w.name));
  const next = d.remainingRoute[0]?.name;
  // On vectors nothing is "ahead" on own navigation, but nothing was flown past either.
  const onOwnNav = d.remainingRoute.length > 0;
  return d.flightPlan.route.map((w) => ({
    name: w.name,
    passed: onOwnNav && !ahead.has(w.name),
    next: w.name === next,
  }));
});
</script>

<template>
  <section class="aircraft-card" :aria-label="`Details of ${callsign}`">
    <header class="head">
      <div class="ident">
        <span class="mono callsign">{{ callsign }}</span>
        <span class="telephony">{{ details?.telephony ?? live?.telephony }}</span>
      </div>
      <button
        type="button"
        class="close"
        aria-label="Close aircraft details"
        @click="$emit('close')"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <template v-else-if="details">
      <div v-if="details.type" class="model">
        <span class="model-name">{{ details.type.model }}</span>
        <span class="mono dim"
          >{{ details.type.icao }} · WAKE {{ details.type.wakeCategory }} · CODE
          {{ details.type.aerodromeCode }} · SPAN {{ details.type.wingspanM }} m</span
        >
      </div>

      <div class="grid three">
        <div v-for="w in weights" :key="w.label" class="cell">
          <span class="label">{{ w.label }}</span>
          <span class="mono value">{{ w.value }}</span>
          <span v-if="w.sub" class="mono dim small">{{ w.sub }}</span>
        </div>
      </div>

      <div class="grid four">
        <div v-for="s in state" :key="s.label" class="cell">
          <span class="label">{{ s.label }}</span>
          <span class="mono value">{{ s.value }}</span>
          <span v-if="s.to" class="mono cleared small">{{ s.to }}</span>
        </div>
      </div>

      <div v-if="details.flightPlan" class="block">
        <div class="row">
          <h3 class="section-title">FLIGHT PLAN</h3>
          <span class="mono nav">{{ navigation }}</span>
        </div>
        <div class="mono plan">
          <span class="airport">{{ details.flightPlan.departure }}</span>
          <template v-for="w in route" :key="w.name">
            <span class="arrow" aria-hidden="true">›</span>
            <span class="fix" :class="{ passed: w.passed, next: w.next }">{{ w.name }}</span>
          </template>
          <span class="arrow" aria-hidden="true">›</span>
          <span class="airport">{{ details.flightPlan.destination }}</span>
        </div>
        <span class="mono dim small">CRUISE FL{{ details.flightPlan.cruiseLevel }}</span>
      </div>

      <div v-if="details.runways.length" class="block">
        <h3 class="section-title">RUNWAY AT LRCV</h3>
        <div
          v-for="r in details.runways"
          :key="r.runway"
          class="runway"
          :class="{ ok: r.compatible, bad: !r.compatible }"
        >
          <div class="row">
            <span class="mono rwy">RWY {{ r.runway }}</span>
            <span class="verdict">
              <svg
                v-if="r.compatible"
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
              <svg
                v-else
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              {{ r.compatible ? 'COMPATIBLE' : 'NOT COMPATIBLE' }}
            </span>
            <span v-if="r.recommended" class="mono tag">RECOMMENDED</span>
          </div>
          <span class="notes">{{ r.notes.join(' · ') }}</span>
        </div>
        <p class="footnote">
          Planning estimate from published type data<span v-if="details.weatherBasis === 'live'">
            and the live METAR</span
          >. Advisory only.
        </p>
      </div>
    </template>
    <p v-else class="dim">Loading…</p>
  </section>
</template>

<style scoped>
.aircraft-card {
  width: 400px;
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--color-panel-overlay);
  border: var(--border-width) solid var(--color-atc);
  border-radius: var(--radius-card);
  backdrop-filter: blur(2px);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.ident {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.callsign {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-atc);
}

.telephony {
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  background: transparent;
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: 16px;
}

.model {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.model-name {
  font-size: 17px;
  font-weight: 600;
}

.grid {
  display: grid;
  gap: 6px;
}

.grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.grid.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.cell {
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius);
}

.label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}

.value {
  font-size: 14px;
}

.small {
  font-size: 12px;
}

.dim {
  color: var(--color-text-muted);
  font-size: 12px;
}

.cleared {
  color: var(--color-atc);
}

.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.block .section-title {
  font-size: 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.row .section-title {
  flex-grow: 1;
}

.nav {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-atc);
}

.plan {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  font-size: 14px;
}

.airport {
  font-weight: 700;
}

.arrow {
  color: var(--color-text-faint);
}

.fix.passed {
  color: var(--color-text-faint);
  text-decoration: line-through;
}

.fix.next {
  padding: 0 4px;
  border-radius: var(--radius-sm);
  color: var(--color-atc);
  background: var(--color-atc-bg);
}

.runway {
  padding: var(--space-2) 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-radius: var(--radius);
  border: var(--border-width) solid var(--color-border);
  background: var(--color-panel-raised);
}

.rwy {
  font-size: 14px;
  font-weight: 700;
}

.verdict {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.runway.ok .verdict {
  color: var(--color-ok);
}

.runway.bad .verdict {
  color: var(--color-warning);
}

.tag {
  margin-left: auto;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  color: var(--color-atc);
  background: var(--color-atc-bg);
}

.notes {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.footnote {
  margin: 0;
  font-size: 11px;
  color: var(--color-text-faint);
}

.error {
  margin: 0;
  color: var(--color-warning);
}
</style>
