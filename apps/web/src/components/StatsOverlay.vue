<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useNow } from '../composables/useNow';
import { useDemoStore } from '../stores/useDemoStore';
import { formatAge } from '../utils/format';

defineEmits<{ close: [] }>();

const demo = useDemoStore();
const { stats, session } = storeToRefs(demo);
const now = useNow();

const sessionClock = computed(() => {
  if (!session.value) return '';
  const s = Math.max(0, Math.floor((now.value - Date.parse(session.value.startedAt)) / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${formatAge(s % 3600)}`;
});

const tiles = computed(() => {
  const s = stats.value;
  const fmt = (v: number | null | undefined, digits: number) =>
    v == null ? '—' : v.toFixed(digits);
  return [
    { value: String(s?.faultsInjected ?? 0), unit: '', label: 'Faults injected', ok: false },
    { value: String(s?.faultsDetected ?? 0), unit: '', label: 'Faults detected', ok: true },
    {
      value: fmt(s?.meanDetectionS, 1),
      unit: s?.meanDetectionS == null ? '' : ' s',
      label: 'Mean detection time',
      ok: false,
    },
    {
      value: s?.parserAccuracy == null ? '—' : String(Math.round(s.parserAccuracy * 100)),
      unit: s?.parserAccuracy == null ? '' : '%',
      label: 'Parser accuracy, test set',
      ok: false,
    },
    {
      value: s?.meanSttLatencyMs == null ? '—' : fmt(s.meanSttLatencyMs / 1000, 1),
      unit: s?.meanSttLatencyMs == null ? '' : ' s',
      label: 'Mean speech-to-text latency',
      ok: false,
    },
  ];
});

const summary = computed(() => {
  const s = stats.value;
  if (!s || s.faultsInjected === 0) return 'No faults injected yet in this session.';
  if (s.faultsDetected === s.faultsInjected) {
    return `Every injected readback, execution and comms fault raised its alert, in ${s.meanDetectionS?.toFixed(1)} s on average.`;
  }
  return `${s.faultsDetected} of ${s.faultsInjected} injected faults raised their alert.`;
});

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape')
    demo.trigger('stats-overlay', { visible: false }).catch(() => undefined);
}

onMounted(() => {
  void demo.refreshStats().catch(() => undefined);
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="stats-title">
      <div class="head">
        <h2 id="stats-title">Demo results</h2>
        <span class="mono meta">SESSION {{ sessionClock }} · CRAIOVA APPROACH</span>
      </div>
      <div class="tiles">
        <div v-for="t in tiles" :key="t.label" class="tile">
          <span class="value mono" :class="{ ok: t.ok }"
            >{{ t.value }}<span class="unit">{{ t.unit }}</span></span
          >
          <span class="label">{{ t.label }}</span>
        </div>
      </div>
      <p class="summary">{{ summary }}</p>
      <button type="button" class="close" @click="$emit('close')">Close</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-overlay);
}

.dialog {
  width: 1040px;
  max-width: calc(100% - 48px);
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-dialog);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

h2 {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
}

.meta {
  font-size: 15px;
  color: var(--color-text-muted);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-4);
}

.tile {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border);
  border-radius: 12px;
}

.value {
  font-size: 56px;
  font-weight: 700;
}

.value.ok {
  color: var(--color-ok);
}

.unit {
  font-size: 24px;
}

.label {
  font-size: 15px;
  color: var(--color-text-muted);
}

.summary {
  margin: 0;
  font-size: 17px;
  color: var(--color-text-secondary);
}

.close {
  align-self: flex-end;
  height: 40px;
  padding: 0 var(--space-5);
  border-radius: var(--radius);
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
  color: var(--color-text-secondary);
  font-weight: 600;
}
</style>
