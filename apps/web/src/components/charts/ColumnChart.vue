<script setup lang="ts">
import { computed, ref } from 'vue';
import { niceScale, useChartSize } from './useChartSize';

/** Vertical bars over ordered buckets (e.g. how long resolving took); hover shows a bucket. */
const props = defineProps<{
  buckets: { label: string; count: number }[];
  /** What one count is, for the tooltip: 'alerts'. */
  unit: string;
}>();

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 26, left: 30 };

const box = ref<HTMLElement | null>(null);
const width = useChartSize(box, 400);
const hover = ref<number | null>(null);

const plotW = computed(() => width.value - PAD.left - PAD.right);
const plotH = HEIGHT - PAD.top - PAD.bottom;
const scale = computed(() => niceScale(Math.max(1, ...props.buckets.map((b) => b.count))));
const slot = computed(() => plotW.value / Math.max(1, props.buckets.length));
const barW = computed(() => Math.min(56, slot.value - 8));
const y = (v: number) => PAD.top + plotH - (v / scale.value.top) * plotH;
const total = computed(() => props.buckets.reduce((n, b) => n + b.count, 0));
</script>

<template>
  <div ref="box" class="chart">
    <svg :width="width" :height="HEIGHT" role="img" :aria-label="`Distribution of ${unit}`">
      <g class="grid">
        <g v-for="t in scale.ticks" :key="t">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(t)" :y2="y(t)" />
          <text :x="PAD.left - 8" :y="y(t) + 4" text-anchor="end">{{ t }}</text>
        </g>
      </g>
      <g
        v-for="(b, i) in buckets"
        :key="b.label"
        class="col"
        :class="{ dim: hover !== null && hover !== i }"
        @mouseenter="hover = i"
        @mouseleave="hover = null"
      >
        <rect class="hit" :x="PAD.left + slot * i" :y="PAD.top" :width="slot" :height="plotH" />
        <path
          v-if="b.count"
          class="bar"
          :d="`M${PAD.left + slot * i + (slot - barW) / 2},${y(0)}
               V${y(b.count) + 4} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${y(0)} Z`"
        />
        <text class="axis" :x="PAD.left + slot * (i + 0.5)" :y="HEIGHT - 8" text-anchor="middle">
          {{ b.label }}
        </text>
      </g>
    </svg>
    <div
      v-if="hover !== null && buckets[hover]"
      class="tooltip"
      :style="{ left: `${Math.min(width - 170, PAD.left + slot * (hover + 0.5))}px` }"
    >
      <span class="mono">{{ buckets[hover].label }}</span>
      <span>
        <strong class="mono">{{ buckets[hover].count }}</strong> {{ unit }}
        <template v-if="total">
          · {{ Math.round((buckets[hover].count / total) * 100) }}%
        </template>
      </span>
    </div>
  </div>
</template>

<style scoped>
.chart {
  position: relative;
  width: 100%;
}

svg {
  display: block;
}

.grid line {
  stroke: var(--chart-grid);
}

.grid text,
.axis {
  font-family: var(--font-data);
  font-size: 11px;
  fill: var(--chart-axis);
}

.hit {
  fill: transparent;
}

.bar {
  fill: var(--chart-series);
  transition: opacity 0.15s;
}

.col.dim .bar {
  opacity: 0.45;
}

.tooltip {
  position: absolute;
  top: 0;
  min-width: 150px;
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}

strong {
  color: var(--color-text);
}
</style>
