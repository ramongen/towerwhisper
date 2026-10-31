<script setup lang="ts">
import { computed } from 'vue';

/**
 * Ranked horizontal bars, one row per item: label, bar, value (text in text colours, the bar
 * carries the magnitude). Hover a row for its detail line.
 */
export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Shown on the right instead of the raw value. */
  display?: string;
  /** Detail on hover. */
  detail?: string;
}

const props = defineProps<{ items: BarItem[]; empty?: string }>();

const max = computed(() => Math.max(1, ...props.items.map((i) => i.value)));
</script>

<template>
  <ul v-if="items.length" class="bar-list">
    <li v-for="item in items" :key="item.key" class="row" :title="item.detail">
      <span class="label">{{ item.label }}</span>
      <span class="track">
        <span class="bar" :style="{ width: `${Math.max(2, (item.value / max) * 100)}%` }" />
      </span>
      <span class="value mono">{{ item.display ?? item.value }}</span>
      <span v-if="item.detail" class="detail mono">{{ item.detail }}</span>
    </li>
  </ul>
  <p v-else class="empty">{{ empty ?? 'Nothing in this range.' }}</p>
</template>

<style scoped>
.bar-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(120px, 42%) 1fr 72px;
  align-items: center;
  gap: var(--space-3);
  padding: 7px var(--space-2);
  border-radius: var(--radius-sm);
}

.row:hover {
  background: var(--color-panel-raised);
}

.label {
  font-size: 14px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track {
  height: 10px;
}

.bar {
  display: block;
  height: 100%;
  background: var(--chart-series);
  border-radius: 0 4px 4px 0;
}

.value {
  font-size: 14px;
  text-align: right;
  color: var(--color-text);
}

.detail {
  display: none;
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--color-text-muted);
}

.row:hover .detail {
  display: block;
}

.empty {
  margin: 0;
  padding: var(--space-4) 0;
  font-size: 14px;
  color: var(--color-text-faint);
}
</style>
