<script setup lang="ts">
import type { DemoTriggerName, FaultConfig } from '@towerwhisper/shared';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useSocket } from '../composables/useSocket';
import { useDemoStore } from '../stores/useDemoStore';
import { useTrafficStore } from '../stores/useTrafficStore';
import DemoTile from './DemoTile.vue';
import {
  DEMO_LIMITS,
  EXECUTION_FAULTS,
  READBACK_FAULTS,
  REAL_LIMITS,
  type ExecutionKind,
  type ReadbackKind,
} from './demoFaults';

/** Live counters refresh this often. */
const STATS_POLL_MS = 2000;
/** "SENT" stays on a trigger tile this long. */
const SENT_MS = 2000;
/** Ageing a timer lands just past the limit, so the alert shows 16 min / 31 s. */
const AGE_MARGIN = { real: 60, demo: 1 };

const demo = useDemoStore();
const { faults, stats, overlayVisible } = storeToRefs(demo);
const { aircraft } = storeToRefs(useTrafficStore());
const { connected } = useSocket();

const once = ref(true);
const sent = ref<string | null>(null);
const feedback = ref('');
const pickedCallsign = ref<string>('');

const target = computed(() => faults.value?.target.mode ?? 'selected');
const demoLimits = computed(() => (faults.value?.commsLimits.cautionS ?? 900) < 120);
const noisePercent = computed(() => Math.round((faults.value?.radioNoise ?? 0) * 100));
const callsigns = computed(() => aircraft.value.map((a) => a.callsign));

async function run(action: () => Promise<unknown>, done?: string): Promise<void> {
  try {
    await action();
    if (done) feedback.value = done;
  } catch (error) {
    feedback.value = `Failed: ${(error as Error).message}`;
  }
}

function patch(p: Partial<FaultConfig>, done?: string): Promise<void> {
  return run(() => demo.update(p), done);
}

function setTarget(mode: FaultConfig['target']['mode'], callsign?: string): void {
  void patch({ target: { mode, callsign } });
}

function onPickCallsign(): void {
  if (pickedCallsign.value) setTarget('callsign', pickedCallsign.value);
}

function setOnce(value: boolean): void {
  once.value = value;
  const f = faults.value;
  if (!f) return;
  // Re-arm what is armed with the new mode.
  void patch({
    readback: f.readback ? { ...f.readback, once: value } : null,
    execution: f.execution ? { ...f.execution, once: value } : null,
  });
}

function toggleReadback(kind: ReadbackKind, label: string): void {
  const armed = faults.value?.readback?.kind === kind;
  void patch(
    { readback: armed ? null : { kind, once: once.value } },
    armed ? `${label} disarmed` : `${label} armed for the next readback`,
  );
}

function toggleExecution(kind: ExecutionKind, label: string): void {
  const armed = faults.value?.execution?.kind === kind;
  void patch(
    { execution: armed ? null : { kind, once: once.value } },
    armed ? `${label} disarmed` : `${label} armed for the next manoeuvre`,
  );
}

async function fire(name: DemoTriggerName, body: object = {}, id: string = name): Promise<void> {
  await run(async () => {
    const result = await demo.trigger(name, body);
    feedback.value = result.message;
    sent.value = id;
    setTimeout(() => sent.value === id && (sent.value = null), SENT_MS);
  });
}

function ageTo(level: 'caution' | 'warning'): void {
  const limits = faults.value?.commsLimits ?? REAL_LIMITS;
  const margin = demoLimits.value ? AGE_MARGIN.demo : AGE_MARGIN.real;
  const ageS = (level === 'caution' ? limits.cautionS : limits.warningS) + margin;
  void fire('age-comms', { ageS }, `age-${level}`);
}

function setNoise(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value) / 100;
  void patch({ radioNoise: value });
}

async function reset(): Promise<void> {
  await run(() => demo.resetScenario(), 'Scenario restarted');
}

const speeds: { value: FaultConfig['timeScale']; label: string }[] = [
  { value: 0, label: 'Pause' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
];

let poll: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void demo.refreshStats().catch(() => undefined);
  poll = setInterval(() => void demo.refreshStats().catch(() => undefined), STATS_POLL_MS);
});
onBeforeUnmount(() => clearInterval(poll));

const avgDetection = computed(() =>
  stats.value?.meanDetectionS == null ? '—' : `${stats.value.meanDetectionS.toFixed(1)} s`,
);
</script>

<template>
  <div class="demo-panel">
    <header class="header">
      <div class="title-row">
        <h1 class="title">DEMO CONTROL</h1>
        <span class="live" :class="{ down: !connected }">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <circle cx="5" cy="5" r="4" />
          </svg>
          {{ connected ? 'Live · LRCV' : 'Offline' }}
        </span>
      </div>
      <div class="counters">
        <div class="counter">
          <span class="value mono">{{ stats?.faultsInjected ?? 0 }}</span>
          <span class="caption">Injected</span>
        </div>
        <div class="counter">
          <span class="value mono ok">{{ stats?.faultsDetected ?? 0 }}</span>
          <span class="caption">Detected</span>
        </div>
        <div class="counter">
          <span class="value mono">{{ avgDetection }}</span>
          <span class="caption">Avg detection</span>
        </div>
      </div>
    </header>

    <section class="section">
      <h2 class="section-title">TARGET</h2>
      <div class="segmented three" role="group" aria-label="Target aircraft">
        <button type="button" :class="{ on: target === 'selected' }" @click="setTarget('selected')">
          Selected
        </button>
        <label class="select-seg" :class="{ on: target === 'callsign' }">
          <span class="visually-hidden">Target callsign</span>
          <select v-model="pickedCallsign" class="mono" @change="onPickCallsign">
            <option value="" disabled>Callsign ▾</option>
            <option v-for="cs in callsigns" :key="cs" :value="cs">{{ cs }}</option>
          </select>
        </label>
        <button type="button" :class="{ on: target === 'any' }" @click="setTarget('any')">
          Any
        </button>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">MODE</h2>
      <div class="segmented two mono" role="group" aria-label="Fault mode">
        <button type="button" :class="{ on: once }" @click="setOnce(true)">ONCE</button>
        <button type="button" :class="{ on: !once }" @click="setOnce(false)">PERSISTENT</button>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">READBACK FAULTS</h2>
      <div class="tiles">
        <DemoTile
          v-for="(f, i) in READBACK_FAULTS"
          :key="f.kind"
          :label="f.label"
          :tag="f.tag"
          :shortcut="String(i + 1)"
          :armed="faults?.readback?.kind === f.kind"
          @press="toggleReadback(f.kind, f.label)"
        />
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">EXECUTION FAULTS</h2>
      <div class="tiles">
        <DemoTile
          v-for="(f, i) in EXECUTION_FAULTS"
          :key="f.kind"
          :label="f.label"
          :tag="f.tag"
          :shortcut="i < 2 ? String(i + 8) : undefined"
          :armed="faults?.execution?.kind === f.kind"
          @press="toggleExecution(f.kind, f.label)"
        />
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">COMMS TIMER</h2>
      <span class="sub-title">No-contact limits</span>
      <div class="segmented two mono" role="group" aria-label="No-contact limits">
        <button
          type="button"
          :class="{ on: !demoLimits }"
          @click="patch({ commsLimits: REAL_LIMITS }, 'Limits 15 / 30 min')"
        >
          15 / 30 min
        </button>
        <button
          type="button"
          :class="{ on: demoLimits }"
          @click="patch({ commsLimits: DEMO_LIMITS }, 'Limits 15 / 30 s')"
        >
          15 / 30 s
        </button>
      </div>
      <p class="note">
        Amber at the first limit, red at the second. Demo limits let the jury see it happen live.
      </p>
      <div class="tiles">
        <DemoTile
          :label="demoLimits ? 'Age to 15 s' : 'Age to 15 min'"
          tag="NO CONTACT · AMBER"
          :sent="sent === 'age-caution'"
          @press="ageTo('caution')"
        />
        <DemoTile
          :label="demoLimits ? 'Age to 30 s' : 'Age to 30 min'"
          tag="NO CONTACT · RED"
          :sent="sent === 'age-warning'"
          @press="ageTo('warning')"
        />
      </div>
      <button type="button" class="outline" @click="fire('reset-comms')">
        Reset timer on target
      </button>
    </section>

    <section class="section">
      <h2 class="section-title">SCENARIO</h2>
      <div class="tiles">
        <DemoTile
          label="Spawn conflict"
          tag="CONFLICT PREDICTED"
          :sent="sent === 'conflict'"
          @press="fire('conflict')"
        />
        <DemoTile
          label="Stepped-on transmission"
          tag="SAY AGAIN"
          :sent="sent === 'stepped-on'"
          @press="fire('stepped-on')"
        />
      </div>
      <div class="box">
        <div class="row">
          <label for="noise" class="sub-title">Radio noise</label>
          <span class="mono accent">{{ noisePercent }}%</span>
        </div>
        <input
          id="noise"
          type="range"
          min="0"
          max="100"
          step="5"
          :value="noisePercent"
          @change="setNoise"
        />
      </div>
      <span class="sub-title">Time speed</span>
      <div class="segmented four mono" role="group" aria-label="Time speed">
        <button
          v-for="s in speeds"
          :key="s.value"
          type="button"
          :class="{ on: faults?.timeScale === s.value }"
          @click="patch({ timeScale: s.value })"
        >
          {{ s.label }}
        </button>
      </div>
      <button
        type="button"
        class="outline"
        @click="fire('stats-overlay', { visible: !overlayVisible })"
      >
        {{ overlayVisible ? 'Hide results on big screen' : 'Show results on big screen' }}
      </button>
      <button type="button" class="danger" @click="reset">RESET SCENARIO</button>
    </section>

    <p class="feedback" role="status" aria-live="polite">{{ feedback }}</p>
  </div>
</template>

<style scoped>
.demo-panel {
  padding: var(--space-5) var(--space-4) 28px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  color: var(--color-text);
  background: var(--color-bg);
}

.header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.live {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-muted);
  fill: var(--color-ok);
}

.live.down {
  fill: var(--color-warning);
}

.counters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.counter {
  padding: 10px var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-card);
}

.value {
  font-size: 22px;
  font-weight: 700;
}

.value.ok {
  color: var(--color-ok);
}

.caption {
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section .section-title {
  font-size: 12px;
}

.sub-title {
  font-size: 14px;
  font-weight: 600;
}

.note {
  margin: 0;
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
}

.segmented {
  display: grid;
  gap: 6px;
  padding: 4px;
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-card);
}

.segmented.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.segmented.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.segmented.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.segmented button,
.select-seg {
  min-height: 44px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  background: transparent;
  border: var(--border-width) solid transparent;
}

.segmented .on {
  color: var(--color-atc);
  background: var(--color-atc-selected-bg);
  border-color: var(--color-atc);
}

.select-seg {
  display: flex;
}

.select-seg select {
  width: 100%;
  padding: 0 var(--space-2);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  color: inherit;
  background: transparent;
  border: none;
  appearance: none;
  cursor: pointer;
}

.select-seg select option {
  color: var(--color-text);
  background: var(--color-panel);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.box {
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-card);
}

.row {
  display: flex;
  justify-content: space-between;
}

.accent {
  font-size: 14px;
  color: var(--color-atc);
}

input[type='range'] {
  width: 100%;
  height: 28px;
  accent-color: var(--color-atc);
}

.outline {
  min-height: 44px;
  border-radius: var(--radius-card);
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.danger {
  min-height: 52px;
  border-radius: var(--radius-card);
  background: var(--color-warning-bg);
  border: var(--border-width) solid var(--color-warning);
  color: var(--color-warning);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.feedback {
  min-height: 20px;
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
</style>
