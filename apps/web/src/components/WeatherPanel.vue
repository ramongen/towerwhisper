<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useNow } from '../composables/useNow';
import { useWeatherStore } from '../stores/useWeatherStore';
import { ago } from '../utils/format';

const { current: w } = storeToRefs(useWeatherStore());
const now = useNow(10_000);

const pad = (n: number, size = 2) => String(Math.abs(Math.round(n))).padStart(size, '0');

const wind = computed(() => {
  if (!w.value) return '';
  const dir = w.value.windDirDeg === null ? 'VRB' : `${pad(w.value.windDirDeg, 3)}°`;
  const gust = w.value.windGustKt ? ` G${pad(w.value.windGustKt)}` : '';
  return w.value.windSpeedKt === 0 ? 'CALM' : `${dir} ${pad(w.value.windSpeedKt)}${gust} KT`;
});

const visibility = computed(() => {
  const v = w.value?.visibilityM;
  if (v === null || v === undefined) return '—';
  return v >= 9999 ? '10 km+' : v >= 5000 ? `${(v / 1000).toFixed(0)} km` : `${v} m`;
});

const clouds = computed(() => {
  if (!w.value) return '';
  if (!w.value.clouds.length) return w.value.source === 'model' ? '—' : 'NSC';
  return w.value.clouds
    .map((c) => `${c.cover}${String(Math.round(c.baseFt / 100)).padStart(3, '0')}`)
    .join(' ');
});

const observed = computed(() =>
  w.value ? `${w.value.observedAt.slice(11, 13)}${w.value.observedAt.slice(14, 16)}Z` : '',
);

const runways = computed(() =>
  (w.value?.runwayWind ?? []).map((r) => ({
    ...r,
    preferred: r.runway === w.value?.preferredRunway,
    along: r.headwindKt >= 0 ? `HW ${pad(r.headwindKt)}` : `TW ${pad(r.headwindKt)}`,
  })),
);
</script>

<template>
  <section class="weather" aria-label="Airport weather">
    <template v-if="w">
      <div class="head">
        <span class="mono title"
          >{{ w.icao }} · {{ w.source === 'metar' ? 'METAR' : 'MODEL' }} {{ observed }}</span
        >
        <span v-if="w.flightCategory" class="mono category" :class="w.flightCategory.toLowerCase()">
          {{ w.flightCategory }}
        </span>
      </div>
      <dl class="rows mono">
        <dt>WIND</dt>
        <dd>{{ wind }}</dd>
        <dt>VIS</dt>
        <dd>
          {{ visibility }}<span v-if="w.weather" class="wx">{{ w.weather }}</span>
        </dd>
        <dt>CLOUD</dt>
        <dd>
          {{ clouds
          }}<span v-if="w.ceilingFt !== null" class="dim"> · CIG {{ w.ceilingFt }} ft</span>
        </dd>
        <dt>T / DP</dt>
        <dd>
          {{ w.temperatureC ?? '—' }} / {{ w.dewpointC ?? '—' }} °C <span class="dim">QNH</span>
          {{ w.qnhHpa ?? '—' }}
        </dd>
      </dl>
      <div class="runways mono">
        <div
          v-for="r in runways"
          :key="r.runway"
          class="runway"
          :class="{ preferred: r.preferred, tail: r.headwindKt < 0 }"
        >
          <span class="rwy">RWY {{ r.runway }}</span>
          <span>{{ r.along }}</span>
          <span>XW {{ pad(r.crosswindKt) }}</span>
          <span v-if="r.preferred" class="tag">IN USE</span>
        </div>
      </div>
      <p v-if="w.raw" class="raw mono">{{ w.raw }}</p>
      <p class="updated">
        Live · observed {{ ago(w.observedAt, now) }}<span v-if="w.wetRunway"> · runway wet</span>
      </p>
    </template>
    <p v-else class="updated">Weather: waiting for the first observation…</p>
  </section>
</template>

<style scoped>
.weather {
  width: 340px;
  padding: var(--space-3) 14px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background: var(--color-panel-overlay);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-card);
  backdrop-filter: blur(2px);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.category {
  padding: 1px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  border: var(--border-width) solid currentColor;
}

/* Flight category: worse weather, stronger colour (amber IFR, red LIFR). */
.category.vfr {
  color: var(--color-ok);
}

.category.mvfr {
  color: var(--color-text-secondary);
}

.category.ifr {
  color: var(--color-caution);
  background: var(--color-caution-bg);
}

.category.lifr {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.rows {
  margin: 0;
  display: grid;
  grid-template-columns: 64px 1fr;
  row-gap: 4px;
  font-size: 14px;
}

dt {
  color: var(--color-text-muted);
}

dd {
  margin: 0;
  color: var(--color-text);
}

.wx {
  margin-left: var(--space-2);
  color: var(--color-atc);
}

.dim {
  color: var(--color-text-muted);
}

.runways {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.runway {
  display: grid;
  grid-template-columns: 64px 56px 56px 1fr;
  align-items: center;
  color: var(--color-text-secondary);
}

.runway.tail {
  color: var(--color-text-muted);
}

.runway.preferred .rwy {
  color: var(--color-text);
  font-weight: 700;
}

.tag {
  justify-self: end;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  color: var(--color-atc);
  background: var(--color-atc-bg);
}

.raw {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-text-faint);
}

.updated {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
