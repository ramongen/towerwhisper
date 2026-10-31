<script setup lang="ts">
import type { AnalyticsRange } from '@towerwhisper/shared';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import BarList from '../../components/charts/BarList.vue';
import ColumnChart from '../../components/charts/ColumnChart.vue';
import TimelineChart from '../../components/charts/TimelineChart.vue';
import SectorCard from '../../components/supervisor/SectorCard.vue';
import { useNow } from '../../composables/useNow';
import { useSectorStore } from '../../stores/useSectorStore';
import { useSupervisorStore } from '../../stores/useSupervisorStore';
import { alertLabel, duration, utcDateTime } from '../../utils/format';

/** Statistics are re-read this often (the live sector cards come from the socket). */
const ANALYTICS_REFRESH_MS = 30_000;

const RANGES: { id: AnalyticsRange; label: string }[] = [
  { id: '1h', label: '1 H' },
  { id: '24h', label: '24 H' },
  { id: '7d', label: '7 D' },
  { id: '30d', label: '30 D' },
];

const supervisor = useSupervisorStore();
const { sectors, analytics, range, sectorFilter, loading, error } = storeToRefs(supervisor);
const sectorStore = useSectorStore();
const router = useRouter();
const now = useNow();
let timer: ReturnType<typeof setInterval> | undefined;

watch([range, sectorFilter], () => void supervisor.loadAnalytics());

onMounted(() => {
  void sectorStore.loadAll().catch(() => undefined);
  void supervisor.loadAnalytics();
  timer = setInterval(() => void supervisor.loadAnalytics(), ANALYTICS_REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));

const sectorName = (id: string) => sectorStore.byId(id)?.name ?? id;

const totals = computed(() => analytics.value?.totals);
const resolvedShare = computed(() => {
  const t = totals.value;
  return t && t.raised ? Math.round((t.resolved / t.raised) * 100) : null;
});

const tiles = computed(() => {
  const t = totals.value;
  return [
    {
      label: 'Alerts raised',
      value: t ? String(t.raised) : '—',
      sub: t ? `${t.warnings} warnings · ${t.cautions} cautions` : '',
    },
    {
      label: 'Resolved by controllers',
      value: t ? String(t.resolved) : '—',
      sub:
        resolvedShare.value !== null ? `${resolvedShare.value}% of alerts raised` : 'no alert yet',
    },
    {
      label: 'Mean time to resolve',
      value: duration(t?.meanResolveS),
      sub: t?.medianResolveS != null ? `median ${duration(t.medianResolveS)}` : '',
    },
    {
      label: 'Alert rate',
      value: t?.ratePerHour != null ? t.ratePerHour.toFixed(1) : '—',
      unit: t?.ratePerHour != null ? '/ h' : '',
      sub: t ? `over ${t.sessionHours.toFixed(1)} h of sector sessions` : '',
    },
    {
      label: 'Transmissions',
      value: t ? String(t.transmissions) : '—',
      sub: 'controller instructions',
    },
    {
      label: 'Active now',
      value: t ? String(t.active) : '—',
      sub: 'alerts waiting for a controller',
      alerting: (t?.active ?? 0) > 0,
    },
  ];
});

/** Resolved / cleared / still open, as one 100% bar with direct labels. */
const outcome = computed(() => {
  const t = totals.value;
  if (!t || !t.raised) return null;
  const open = Math.max(0, t.raised - t.resolved - t.cleared);
  return [
    { key: 'resolved', label: 'Resolved by controller', count: t.resolved },
    { key: 'cleared', label: 'Cleared by the system', count: t.cleared },
    { key: 'open', label: 'Still open', count: open },
  ]
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, pct: (s.count / t.raised) * 100 }));
});

const byType = computed(() =>
  (analytics.value?.byType ?? []).map((t) => ({
    key: t.type,
    label: alertLabel(t.type),
    value: t.count,
    detail: `${t.resolved} resolved · mean ${duration(t.meanResolveS)} to resolve`,
  })),
);

const bySector = computed(() =>
  (analytics.value?.bySector ?? [])
    .map((s) => ({
      key: s.sectorId,
      label: sectorName(s.sectorId),
      value: s.ratePerHour ?? 0,
      display: s.ratePerHour != null ? `${s.ratePerHour.toFixed(1)} /h` : '—',
      detail: `${s.raised} raised · ${s.resolved} resolved · mean ${duration(s.meanResolveS)}`,
    }))
    .sort((a, b) => b.value - a.value),
);

function watchLive(sectorId: string): void {
  void router.push({ name: 'supervisor-live', params: { sectorId } });
}

function replay(sectorId: string): void {
  void router.push({ name: 'supervisor-replay', query: { sector: sectorId } });
}
</script>

<template>
  <div class="overview">
    <section class="section" aria-labelledby="live-title">
      <div class="section-head">
        <h2 id="live-title" class="h2">Sectors live</h2>
        <span class="hint"
          >Every approach sector runs its own session. Watch one live, read-only.</span
        >
      </div>
      <div class="sector-grid">
        <SectorCard
          v-for="s in sectors"
          :key="s.sector.id"
          :sector="s"
          :now="now"
          @watch="watchLive"
          @replay="replay"
        />
        <p v-if="!sectors.length" class="loading mono">CONNECTING TO THE SECTORS…</p>
      </div>
    </section>

    <section class="section" aria-labelledby="stats-title">
      <div class="section-head">
        <h2 id="stats-title" class="h2">Statistics</h2>
        <div class="filters">
          <div class="segmented mono" role="group" aria-label="Time range">
            <button
              v-for="r in RANGES"
              :key="r.id"
              type="button"
              :class="{ on: range === r.id }"
              :aria-pressed="range === r.id"
              @click="range = r.id"
            >
              {{ r.label }}
            </button>
          </div>
          <label class="select">
            <span class="visually-hidden">Sector</span>
            <select v-model="sectorFilter">
              <option value="all">All sectors</option>
              <option v-for="s in sectorStore.all" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <span class="mono updated" :class="{ busy: loading }">
            {{
              error
                ? `UNAVAILABLE · ${error}`
                : analytics
                  ? `TO ${utcDateTime(analytics.to)} UTC`
                  : 'LOADING…'
            }}
          </span>
        </div>
      </div>

      <div class="tiles">
        <div v-for="t in tiles" :key="t.label" class="tile" :class="{ alerting: t.alerting }">
          <span class="tile-label">{{ t.label }}</span>
          <span class="tile-value mono">
            {{ t.value }}<span v-if="t.unit" class="unit">{{ t.unit }}</span>
          </span>
          <span class="tile-sub">{{ t.sub }}</span>
        </div>
      </div>

      <div class="grid two">
        <article class="panel wide">
          <h3 class="panel-title">Alerts over time</h3>
          <TimelineChart
            v-if="analytics"
            :timeline="analytics.timeline"
            :bucket-s="analytics.bucketS"
          />
        </article>
        <article class="panel">
          <h3 class="panel-title">How alerts ended</h3>
          <template v-if="outcome">
            <div class="outcome-bar" role="img" aria-label="Share of alerts by outcome">
              <span
                v-for="s in outcome"
                :key="s.key"
                class="segment"
                :class="s.key"
                :style="{ width: `${s.pct}%` }"
                :title="`${s.label}: ${s.count}`"
              />
            </div>
            <ul class="outcome-legend">
              <li v-for="s in outcome" :key="s.key">
                <span class="swatch" :class="s.key" />
                <span class="o-label">{{ s.label }}</span>
                <span class="mono o-value">{{ s.count }} · {{ Math.round(s.pct) }}%</span>
              </li>
            </ul>
          </template>
          <p v-else class="empty">No alert in this range.</p>
          <h3 class="panel-title spaced">Time to resolve</h3>
          <ColumnChart
            v-if="analytics"
            :buckets="analytics.resolveHistogram"
            unit="alerts resolved"
          />
        </article>
      </div>

      <div class="grid three">
        <article class="panel">
          <h3 class="panel-title">By alert type</h3>
          <BarList :items="byType" />
        </article>
        <article class="panel">
          <h3 class="panel-title">Alert rate by sector</h3>
          <BarList :items="bySector" empty="No sector session in this range." />
        </article>
        <article class="panel">
          <h3 class="panel-title">Controllers</h3>
          <table v-if="analytics?.controllers.length" class="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" class="num">Transm.</th>
                <th scope="col" class="num">Resolved</th>
                <th scope="col" class="num">Mean</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in analytics.controllers" :key="c.userId">
                <td>
                  <span class="cell-name">{{ c.name }}</span>
                  <span class="cell-sub mono">{{ c.sectorId ? sectorName(c.sectorId) : '—' }}</span>
                </td>
                <td class="num mono">{{ c.transmissions }}</td>
                <td class="num mono">{{ c.resolved }}</td>
                <td class="num mono">{{ duration(c.meanResolveS) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty">No controller activity in this range.</p>
        </article>
      </div>

      <article class="panel">
        <h3 class="panel-title">Latest alerts</h3>
        <table v-if="analytics?.recent.length" class="table">
          <thead>
            <tr>
              <th scope="col">Raised (UTC)</th>
              <th scope="col">Sector</th>
              <th scope="col">Alert</th>
              <th scope="col">Message</th>
              <th scope="col">Outcome</th>
              <th scope="col" class="num">Open for</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in analytics.recent" :key="a.id">
              <td class="mono">{{ utcDateTime(a.raisedAt) }}</td>
              <td>{{ sectorName(a.sectorId) }}</td>
              <td>
                <span class="sev mono" :class="a.severity">
                  <svg
                    v-if="a.severity === 'warning'"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 3l10 18H2z" fill="currentColor" />
                  </svg>
                  <svg v-else width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" fill="currentColor" />
                  </svg>
                  {{ alertLabel(a.type) }}
                </span>
              </td>
              <td class="message">{{ a.message }}</td>
              <td class="mono outcome-cell" :class="a.outcome ?? 'open'">
                {{
                  a.outcome === 'resolved'
                    ? 'RESOLVED'
                    : a.outcome === 'cleared'
                      ? 'CLEARED'
                      : 'OPEN'
                }}
              </td>
              <td class="num mono">
                {{
                  duration(
                    ((a.endedAt ? Date.parse(a.endedAt) : now) - Date.parse(a.raisedAt)) / 1000,
                  )
                }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">No alert in this range.</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.overview {
  max-width: 1760px;
  margin: 0 auto;
  padding: var(--space-6) 32px 48px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.hint {
  font-size: 14px;
  color: var(--color-text-muted);
}

.sector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-4);
}

.loading {
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}

.filters {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.segmented {
  display: flex;
  padding: 3px;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.segmented button {
  height: 30px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
}

.segmented button.on {
  color: var(--color-text);
  background: var(--color-border-strong);
}

.select select {
  height: 38px;
  padding: 0 var(--space-3);
  font-size: 14px;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.updated {
  font-size: 12px;
  color: var(--color-text-faint);
  transition: opacity 0.2s;
}

.updated.busy {
  opacity: 0.5;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--space-3);
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-4) var(--space-5);
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-card);
}

.tile.alerting {
  border-color: var(--color-caution);
}

.tile-label {
  font-size: 13px;
  color: var(--color-text-muted);
}

.tile-value {
  font-size: 32px;
  font-weight: 600;
  line-height: 1.1;
}

.unit {
  margin-left: 4px;
  font-size: 15px;
  color: var(--color-text-muted);
}

.tile-sub {
  font-size: 12px;
  color: var(--color-text-faint);
}

.grid {
  display: grid;
  gap: var(--space-3);
}

.grid.two {
  grid-template-columns: 2fr 1fr;
}

.grid.three {
  grid-template-columns: 1fr 1fr 1.2fr;
}

.panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-card);
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.panel-title.spaced {
  margin-top: var(--space-3);
}

.outcome-bar {
  display: flex;
  gap: 2px;
  height: 14px;
}

.segment {
  min-width: 4px;
  height: 100%;
}

.segment:first-child {
  border-radius: 4px 0 0 4px;
}

.segment:last-child {
  border-radius: 0 4px 4px 0;
}

.segment.resolved,
.swatch.resolved {
  background: var(--chart-series);
}

.segment.cleared,
.swatch.cleared {
  background: var(--chart-neutral);
}

.segment.open,
.swatch.open {
  background: var(--color-caution);
}

.outcome-legend {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.outcome-legend li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 14px;
  color: var(--color-text-secondary);
}

.swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.o-value {
  margin-left: auto;
  color: var(--color-text);
}

.empty {
  margin: 0;
  padding: var(--space-3) 0;
  font-size: 14px;
  color: var(--color-text-faint);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table th {
  padding: var(--space-2) var(--space-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
  color: var(--color-text-faint);
  border-bottom: var(--border-width) solid var(--color-border);
}

.table td {
  padding: 9px var(--space-2);
  border-bottom: var(--border-width) solid var(--color-border);
  vertical-align: middle;
}

.table tr:last-child td {
  border-bottom: none;
}

.num {
  text-align: right;
}

.cell-name {
  display: block;
}

.cell-sub {
  font-size: 11px;
  color: var(--color-text-muted);
}

.sev {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.sev.caution {
  color: var(--color-caution);
}

.sev.warning {
  color: var(--color-warning-text);
}

.message {
  max-width: 520px;
  color: var(--color-text-secondary);
}

.outcome-cell {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
}

.outcome-cell.resolved {
  color: var(--chart-series);
}

.outcome-cell.open {
  color: var(--color-caution);
}

@media (max-width: 1500px) {
  .tiles {
    grid-template-columns: repeat(3, 1fr);
  }

  .grid.three {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
