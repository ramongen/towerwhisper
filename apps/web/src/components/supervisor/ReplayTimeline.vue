<script setup lang="ts">
import type { Alert, CommsReadbackPayload, CommsTransmissionPayload } from '@towerwhisper/shared';
import { computed, ref } from 'vue';
import { alertLabel, utcTime } from '../../utils/format';

/**
 * The session as a bar: alerts drawn where they were active (amber / red), transmissions as
 * ticks (cyan controller, violet pilot), the cursor. Click or drag anywhere to jump there.
 */
const props = defineProps<{
  start: number;
  end: number;
  t: number;
  alerts: Alert[];
  comms: (CommsTransmissionPayload | CommsReadbackPayload)[];
}>();
const emit = defineEmits<{ seek: [ms: number] }>();

const track = ref<HTMLElement | null>(null);
const dragging = ref(false);
const hover = ref<{ x: number; t: number; label: string | null } | null>(null);

const span = computed(() => Math.max(1, props.end - props.start));
const pct = (ms: number) =>
  ((Math.min(props.end, Math.max(props.start, ms)) - props.start) / span.value) * 100;

/** Alerts as spans on two lanes by severity. */
const alertSpans = computed(() =>
  props.alerts.map((a) => {
    const from = Date.parse(a.raisedAt);
    const to = a.endedAt ? Date.parse(a.endedAt) : props.end;
    return {
      id: a.id,
      severity: a.severity,
      left: pct(from),
      width: Math.max(0.35, pct(to) - pct(from)),
      label: `${alertLabel(a.type)} · ${a.message}`,
      at: from,
    };
  }),
);

const ticks = computed(() =>
  props.comms.map((c) => ({
    id: c.id,
    speaker: c.speaker,
    left: pct(Date.parse(c.at)),
    at: Date.parse(c.at),
    label: `${c.speaker === 'atc' ? 'ATC' : 'PILOT'} · ${c.transcript}`,
  })),
);

/** Hour/minute marks along the bar (about eight). */
const marks = computed(() => {
  const steps = [60, 120, 300, 600, 900, 1800, 3600, 7200].map((s) => s * 1000);
  const step = steps.find((s) => span.value / s <= 8) ?? steps.at(-1)!;
  const out: { left: number; text: string }[] = [];
  for (let m = Math.ceil(props.start / step) * step; m <= props.end; m += step) {
    out.push({ left: pct(m), text: utcTime(m).slice(0, 5) });
  }
  return out;
});

function timeAt(clientX: number): number {
  const rect = track.value!.getBoundingClientRect();
  const k = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return props.start + k * span.value;
}

/** The nearest event under the pointer, for the hover label (within 6 px). */
function eventNear(clientX: number): string | null {
  const rect = track.value!.getBoundingClientRect();
  const tolerance = (6 / rect.width) * span.value;
  const at = timeAt(clientX);
  const near = [...ticks.value, ...alertSpans.value]
    .map((e) => ({ e, d: Math.abs(e.at - at) }))
    .filter((x) => x.d <= tolerance)
    .sort((a, b) => a.d - b.d)[0];
  return near?.e.label ?? null;
}

function onDown(event: PointerEvent): void {
  dragging.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  emit('seek', timeAt(event.clientX));
}

function onMove(event: PointerEvent): void {
  const rect = track.value!.getBoundingClientRect();
  hover.value = {
    x: event.clientX - rect.left,
    t: timeAt(event.clientX),
    label: eventNear(event.clientX),
  };
  if (dragging.value) emit('seek', timeAt(event.clientX));
}

function onUp(event: PointerEvent): void {
  dragging.value = false;
  (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
}
</script>

<template>
  <div class="timeline">
    <div
      ref="track"
      class="track"
      role="slider"
      tabindex="0"
      aria-label="Replay position"
      :aria-valuemin="start"
      :aria-valuemax="end"
      :aria-valuenow="t"
      :aria-valuetext="`${utcTime(t)} UTC`"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="hover = null"
    >
      <div class="lane alerts-lane">
        <span
          v-for="a in alertSpans"
          :key="a.id"
          class="alert-span"
          :class="a.severity"
          :style="{ left: `${a.left}%`, width: `${a.width}%` }"
        />
      </div>
      <div class="lane comms-lane">
        <span
          v-for="c in ticks"
          :key="c.id"
          class="tick"
          :class="c.speaker"
          :style="{ left: `${c.left}%` }"
        />
      </div>
      <div class="played" :style="{ width: `${pct(t)}%` }" />
      <div class="cursor" :style="{ left: `${pct(t)}%` }">
        <span class="handle" />
      </div>
      <div v-if="hover" class="hover-line" :style="{ left: `${hover.x}px` }">
        <span class="hover-label">
          <span class="mono">{{ utcTime(hover.t) }}</span>
          <span v-if="hover.label" class="event">{{ hover.label }}</span>
        </span>
      </div>
    </div>
    <div class="marks mono" aria-hidden="true">
      <span v-for="m in marks" :key="m.left" class="mark" :style="{ left: `${m.left}%` }">
        {{ m.text }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  position: relative;
  user-select: none;
}

.track {
  position: relative;
  height: 52px;
  background: var(--color-radar-bg);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius);
  cursor: pointer;
  touch-action: none;
}

.lane {
  position: absolute;
  left: 0;
  right: 0;
}

.alerts-lane {
  top: 8px;
  height: 14px;
}

.comms-lane {
  top: 30px;
  height: 14px;
}

.alert-span {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 2px;
  opacity: 0.85;
}

.alert-span.caution {
  background: var(--color-caution);
}

.alert-span.warning {
  background: var(--color-warning);
  z-index: 1;
}

.tick {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  border-radius: 1px;
}

.tick.atc {
  background: var(--color-atc);
}

.tick.pilot {
  background: var(--color-pilot);
}

.played {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: rgba(255, 255, 255, 0.04);
  pointer-events: none;
}

.cursor {
  position: absolute;
  top: -6px;
  bottom: -6px;
  width: 2px;
  margin-left: -1px;
  background: var(--color-text);
  pointer-events: none;
  z-index: 2;
}

.handle {
  position: absolute;
  top: -5px;
  left: -5px;
  width: 12px;
  height: 12px;
  background: var(--color-text);
  border: 2px solid var(--color-panel);
  border-radius: 50%;
}

.hover-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-text-muted);
  pointer-events: none;
  z-index: 3;
}

.hover-label {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 420px;
  padding: 6px 10px;
  font-size: 12px;
  white-space: nowrap;
  color: var(--color-text);
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
}

.event {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text-secondary);
}

.marks {
  position: relative;
  height: 18px;
  margin-top: 4px;
}

.mark {
  position: absolute;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--color-text-faint);
}
</style>
