<script setup lang="ts">
import type { SupervisorAnalytics } from '@towerwhisper/shared';
import { computed, ref } from 'vue';
import { cssZoom } from '../../utils/uiScale';
import { niceScale, useChartSize } from './useChartSize';

/**
 * Alerts raised per time bucket, stacked by severity (caution under warning), with the
 * alerts the controllers resolved as a line on the same count axis. Hover shows a bucket.
 */
const props = defineProps<{
  timeline: SupervisorAnalytics['timeline'];
  bucketS: number;
}>();

const HEIGHT = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

const box = ref<HTMLElement | null>(null);
const width = useChartSize(box);
const hover = ref<number | null>(null);

const plotW = computed(() => width.value - PAD.left - PAD.right);
const plotH = HEIGHT - PAD.top - PAD.bottom;
const scale = computed(() =>
  niceScale(Math.max(1, ...props.timeline.map((b) => Math.max(b.caution + b.warning, b.resolved)))),
);
const slot = computed(() => plotW.value / Math.max(1, props.timeline.length));
const barW = computed(() => Math.max(3, Math.min(28, slot.value * 0.62)));
const y = (v: number) => PAD.top + plotH - (v / scale.value.top) * plotH;
const xMid = (i: number) => PAD.left + slot.value * (i + 0.5);

/** Bars as rects with a 2 px surface gap between the two severities. */
const bars = computed(() =>
  props.timeline.map((b, i) => {
    const x = xMid(i) - barW.value / 2;
    const cautionTop = y(b.caution);
    const warningTop = y(b.caution + b.warning);
    return {
      i,
      x,
      caution: b.caution ? { y: cautionTop, h: y(0) - cautionTop } : null,
      warning: b.warning
        ? { y: warningTop, h: Math.max(1, cautionTop - warningTop - (b.caution ? 2 : 0)) }
        : null,
    };
  }),
);

const resolvedPath = computed(() =>
  props.timeline
    .map((b, i) => `${i ? 'L' : 'M'}${xMid(i).toFixed(1)},${y(b.resolved).toFixed(1)}`)
    .join(''),
);

function label(t: string): string {
  const d = new Date(t);
  if (props.bucketS < 3600) return d.toISOString().slice(11, 16);
  if (props.bucketS < 86400) {
    return props.timeline.length > 26
      ? `${d.toLocaleString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${d.toISOString().slice(11, 13)}h`
      : d.toISOString().slice(11, 16);
  }
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
}

/** About six labels along the axis. */
const xTicks = computed(() => {
  const every = Math.max(1, Math.ceil(props.timeline.length / 6));
  return props.timeline.map((b, i) => ({ i, text: label(b.t) })).filter((t) => t.i % every === 0);
});

const tip = computed(() => {
  if (hover.value === null) return null;
  const b = props.timeline[hover.value];
  if (!b) return null;
  const end = new Date(Date.parse(b.t) + props.bucketS * 1000);
  return {
    left: Math.min(width.value - 190, Math.max(0, xMid(hover.value) + 12)),
    title: `${label(b.t)} – ${label(end.toISOString())} UTC`,
    rows: [
      { key: 'warning', label: 'Warnings', value: b.warning },
      { key: 'caution', label: 'Cautions', value: b.caution },
      { key: 'resolved', label: 'Resolved', value: b.resolved },
    ],
  };
});

function onMove(event: MouseEvent): void {
  const svg = event.currentTarget as SVGElement;
  const rect = svg.getBoundingClientRect();
  const x = (event.clientX - rect.left) / cssZoom(svg);
  const i = Math.floor((x - PAD.left) / slot.value);
  hover.value = i >= 0 && i < props.timeline.length ? i : null;
}
</script>

<template>
  <div ref="box" class="chart">
    <div class="legend" aria-hidden="true">
      <span class="key"><span class="swatch caution" />Caution raised</span>
      <span class="key"><span class="swatch warning" />Warning raised</span>
      <span class="key"><span class="swatch line" />Resolved by controller</span>
    </div>
    <svg
      :width="width"
      :height="HEIGHT"
      role="img"
      aria-label="Alerts raised over time by severity, and alerts resolved"
      @mousemove="onMove"
      @mouseleave="hover = null"
    >
      <g class="grid">
        <g v-for="t in scale.ticks" :key="t">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(t)" :y2="y(t)" />
          <text :x="PAD.left - 8" :y="y(t) + 4" text-anchor="end">{{ t }}</text>
        </g>
      </g>
      <rect
        v-if="hover !== null"
        class="hover-band"
        :x="xMid(hover) - slot / 2"
        :y="PAD.top"
        :width="slot"
        :height="plotH"
      />
      <g v-for="b in bars" :key="b.i">
        <rect
          v-if="b.caution"
          class="bar caution"
          :x="b.x"
          :y="b.caution.y"
          :width="barW"
          :height="b.caution.h"
          rx="2"
        />
        <rect
          v-if="b.warning"
          class="bar warning"
          :x="b.x"
          :y="b.warning.y"
          :width="barW"
          :height="b.warning.h"
          rx="2"
        />
      </g>
      <path class="resolved" :d="resolvedPath" />
      <circle
        v-if="hover !== null && timeline[hover]"
        class="resolved-dot"
        :cx="xMid(hover)"
        :cy="y(timeline[hover].resolved)"
        r="4"
      />
      <g class="axis">
        <text v-for="t in xTicks" :key="t.i" :x="xMid(t.i)" :y="HEIGHT - 8" text-anchor="middle">
          {{ t.text }}
        </text>
      </g>
    </svg>
    <div v-if="tip" class="tooltip" :style="{ left: `${tip.left}px` }">
      <span class="tip-title mono">{{ tip.title }}</span>
      <span v-for="r in tip.rows" :key="r.key" class="tip-row">
        <span class="swatch" :class="r.key === 'resolved' ? 'line' : r.key" />
        {{ r.label }}
        <span class="mono value">{{ r.value }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.chart {
  position: relative;
  width: 100%;
}

.legend {
  display: flex;
  gap: var(--space-5);
  margin-bottom: var(--space-2);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.key,
.tip-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.swatch.caution {
  background: var(--color-caution);
}

.swatch.warning {
  background: var(--color-warning);
}

.swatch.line {
  height: 2px;
  width: 14px;
  background: var(--chart-series);
}

svg {
  display: block;
}

.grid line {
  stroke: var(--chart-grid);
}

.grid text,
.axis text {
  font-family: var(--font-data);
  font-size: 11px;
  fill: var(--chart-axis);
}

.hover-band {
  fill: rgba(255, 255, 255, 0.04);
}

.bar.caution {
  fill: var(--color-caution);
}

.bar.warning {
  fill: var(--color-warning);
}

.resolved {
  fill: none;
  stroke: var(--chart-series);
  stroke-width: 2;
  stroke-linejoin: round;
}

.resolved-dot {
  fill: var(--chart-series);
  stroke: var(--color-panel);
  stroke-width: 2;
}

.tooltip {
  position: absolute;
  top: 36px;
  width: 180px;
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}

.tip-title {
  font-size: 11px;
  color: var(--color-text-muted);
}

.value {
  margin-left: auto;
  color: var(--color-text);
}
</style>
