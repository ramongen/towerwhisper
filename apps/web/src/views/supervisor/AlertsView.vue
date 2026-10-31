<script setup lang="ts">
import type { AlertOutcomeFilter, AlertSearchResponse, AlertType } from '@towerwhisper/shared';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useNow } from '../../composables/useNow';
import { useSectorStore } from '../../stores/useSectorStore';
import { api } from '../../utils/api';
import { alertLabel, duration, utcDateTime } from '../../utils/format';
import { REPLAY_LEAD_S, replayOf } from '../../utils/replay';

/** Every alert ever raised, searchable, each one a click away from its replay. */
const ALERT_TYPES: AlertType[] = [
  'HEARBACK_MISMATCH',
  'READBACK_INCOMPLETE',
  'NO_RESPONSE',
  'WRONG_TURN',
  'WRONG_VERTICAL',
  'LEVEL_BUST',
  'NO_CONTACT',
  'CONFLICT_PREDICTED',
];
const PERIODS = [
  { id: 'all', label: 'All time', hours: null },
  { id: '24h', label: 'Last 24 h', hours: 24 },
  { id: '7d', label: 'Last 7 days', hours: 24 * 7 },
  { id: '30d', label: 'Last 30 days', hours: 24 * 30 },
] as const;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

const sectors = useSectorStore();
const route = useRoute();
const router = useRouter();
const now = useNow();

const q = (key: string) =>
  typeof route.query[key] === 'string' ? (route.query[key] as string) : '';
const sector = ref(q('sector') || 'all');
const type = ref(q('type'));
const severity = ref(q('severity'));
const outcome = ref<AlertOutcomeFilter | ''>((q('outcome') as AlertOutcomeFilter) || '');
const period = ref(q('period') || 'all');
const text = ref(q('q'));
const page = ref(Number(q('page')) || 1);

const result = ref<AlertSearchResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let debounce: ReturnType<typeof setTimeout> | undefined;
let request = 0;

const pages = computed(() => Math.max(1, Math.ceil((result.value?.total ?? 0) / PAGE_SIZE)));
const sectorName = (id: string) => sectors.byId(id)?.name ?? id;

async function load(): Promise<void> {
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(PAGE_SIZE) });
  if (sector.value !== 'all') params.set('sector', sector.value);
  if (type.value) params.set('type', type.value);
  if (severity.value) params.set('severity', severity.value);
  if (outcome.value) params.set('outcome', outcome.value);
  if (text.value.trim()) params.set('q', text.value.trim());
  const hours = PERIODS.find((p) => p.id === period.value)?.hours;
  if (hours) params.set('since', new Date(Date.now() - hours * 3.6e6).toISOString());

  // Keep the filters in the address, so the back button returns to this exact list.
  void router.replace({
    query: Object.fromEntries(
      Object.entries({
        sector: sector.value !== 'all' ? sector.value : '',
        type: type.value,
        severity: severity.value,
        outcome: outcome.value,
        period: period.value !== 'all' ? period.value : '',
        q: text.value.trim(),
        page: page.value > 1 ? String(page.value) : '',
      }).filter(([, v]) => v),
    ),
  });

  const mine = ++request;
  loading.value = true;
  try {
    const next = await api<AlertSearchResponse>('GET', `/supervisor/alerts?${params}`);
    if (mine !== request) return; // a newer search answered first
    result.value = next;
    error.value = null;
  } catch (e) {
    if (mine === request) error.value = (e as Error).message;
  } finally {
    if (mine === request) loading.value = false;
  }
}

watch([sector, type, severity, outcome, period], () => {
  page.value = 1;
  void load();
});
watch(text, () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    page.value = 1;
    void load();
  }, SEARCH_DEBOUNCE_MS);
});

function go(next: number): void {
  page.value = Math.min(pages.value, Math.max(1, next));
  void load();
}

function reset(): void {
  sector.value = 'all';
  type.value = '';
  severity.value = '';
  outcome.value = '';
  period.value = 'all';
  text.value = '';
}

onMounted(() => {
  void sectors.loadAll().catch(() => undefined);
  void load();
});
</script>

<template>
  <div class="alerts-page">
    <div class="head">
      <div>
        <h2 class="h2">Alert history</h2>
        <p class="hint">
          Every alert raised in every sector. <strong>Replay</strong> opens the session
          {{ REPLAY_LEAD_S }} s before the alert, with the aircraft selected.
        </p>
      </div>
      <span class="mono count" :class="{ busy: loading }">
        {{ result ? `${result.total.toLocaleString('en-US')} ALERTS` : 'LOADING…' }}
      </span>
    </div>

    <div class="filters" role="search">
      <label class="search">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" stroke-linecap="round" />
        </svg>
        <span class="visually-hidden">Search messages and callsigns</span>
        <input v-model="text" type="search" placeholder="Callsign or message, e.g. ROT301" />
      </label>
      <label>
        <span class="visually-hidden">Sector</span>
        <select v-model="sector">
          <option value="all">All sectors</option>
          <option v-for="s in sectors.all" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
      <label>
        <span class="visually-hidden">Alert type</span>
        <select v-model="type">
          <option value="">All types</option>
          <option v-for="t in ALERT_TYPES" :key="t" :value="t">{{ alertLabel(t) }}</option>
        </select>
      </label>
      <label>
        <span class="visually-hidden">Severity</span>
        <select v-model="severity">
          <option value="">Any severity</option>
          <option value="warning">Warning</option>
          <option value="caution">Caution</option>
        </select>
      </label>
      <label>
        <span class="visually-hidden">Outcome</span>
        <select v-model="outcome">
          <option value="">Any outcome</option>
          <option value="resolved">Resolved by controller</option>
          <option value="cleared">Cleared by the system</option>
          <option value="open">Still open</option>
        </select>
      </label>
      <label>
        <span class="visually-hidden">Period</span>
        <select v-model="period">
          <option v-for="p in PERIODS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
      </label>
      <button type="button" class="ghost" @click="reset">Clear filters</button>
    </div>

    <p v-if="error" class="error" role="alert">Alerts unavailable: {{ error }}</p>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Raised (UTC)</th>
            <th scope="col">Sector</th>
            <th scope="col">Alert</th>
            <th scope="col">Message</th>
            <th scope="col">Outcome</th>
            <th scope="col" class="num">Open for</th>
            <th scope="col"><span class="visually-hidden">Replay</span></th>
          </tr>
        </thead>
        <tbody :class="{ busy: loading }">
          <tr v-for="a in result?.items ?? []" :key="a.id">
            <td class="mono nowrap">{{ utcDateTime(a.raisedAt) }}</td>
            <td class="nowrap">{{ sectorName(a.sectorId) }}</td>
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
            <td class="mono outcome" :class="a.outcome ?? 'open'">
              <template v-if="a.outcome === 'resolved'">
                RESOLVED<span v-if="a.resolvedBy" class="by"> · {{ a.resolvedBy }}</span>
              </template>
              <template v-else-if="a.outcome === 'cleared'">
                CLEARED<span v-if="a.endReason" class="by"> · {{ a.endReason }}</span>
              </template>
              <template v-else>OPEN</template>
            </td>
            <td class="num mono nowrap">
              {{
                duration(
                  ((a.endedAt ? Date.parse(a.endedAt) : now) - Date.parse(a.raisedAt)) / 1000,
                )
              }}
            </td>
            <td class="actions">
              <RouterLink
                :to="replayOf(a)"
                class="replay"
                :title="`Replay ${sectorName(a.sectorId)} at this alert`"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5l11 7-11 7z" fill="currentColor" />
                </svg>
                Replay
              </RouterLink>
            </td>
          </tr>
          <tr v-if="result && !result.items.length">
            <td colspan="7" class="none">No alert matches these filters.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="result && pages > 1" class="pager" aria-label="Pages">
      <button type="button" class="ghost" :disabled="page <= 1" @click="go(page - 1)">
        Previous
      </button>
      <span class="mono">PAGE {{ page }} / {{ pages }}</span>
      <button type="button" class="ghost" :disabled="page >= pages" @click="go(page + 1)">
        Next
      </button>
    </nav>
  </div>
</template>

<style scoped>
.alerts-page {
  max-width: 1600px;
  margin: 0 auto;
  padding: var(--space-6) 32px 48px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-4);
}

.h2 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
}

.hint {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-muted);
}

.hint strong {
  color: var(--color-text-secondary);
}

.count {
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  transition: opacity 0.2s;
}

.count.busy,
tbody.busy {
  opacity: 0.55;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.search {
  flex: 1 1 280px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 40px;
  padding: 0 var(--space-3);
  color: var(--color-text-muted);
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.search input {
  flex: 1;
  font-size: 14px;
  background: transparent;
  border: none;
  outline: none;
}

select {
  height: 40px;
  padding: 0 var(--space-3);
  font-size: 14px;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.ghost {
  height: 40px;
  padding: 0 var(--space-4);
  font-size: 14px;
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.ghost:hover:not(:disabled) {
  border-color: var(--color-text-muted);
}

.ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.error {
  margin: 0;
  padding: var(--space-3);
  color: var(--color-warning-text);
  background: var(--color-warning-bg);
  border-radius: var(--radius);
}

.table-wrap {
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table th {
  padding: var(--space-3) var(--space-4);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
  color: var(--color-text-faint);
  background: var(--color-panel-raised);
  border-bottom: var(--border-width) solid var(--color-border);
}

.table td {
  padding: 10px var(--space-4);
  border-bottom: var(--border-width) solid var(--color-border);
  vertical-align: middle;
}

.table tr:last-child td {
  border-bottom: none;
}

.table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.nowrap {
  white-space: nowrap;
}

.num {
  text-align: right;
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
  color: var(--color-text-secondary);
}

.outcome {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.outcome.resolved {
  color: var(--chart-series);
}

.outcome.open {
  color: var(--color-caution);
}

.by {
  font-weight: 400;
  color: var(--color-text-muted);
}

.actions {
  text-align: right;
}

.replay {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 var(--space-3);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-atc);
  text-decoration: none;
  background: var(--color-atc-bg);
  border: var(--border-width) solid var(--color-atc);
  border-radius: var(--radius);
  white-space: nowrap;
}

.replay:hover {
  background: var(--color-atc-selected-bg);
}

.none {
  color: var(--color-text-faint);
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  font-size: 13px;
  color: var(--color-text-muted);
}
</style>
