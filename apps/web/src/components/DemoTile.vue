<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  /** The alert this fault should produce, e.g. 'HEARBACK MISMATCH'. */
  tag: string;
  armed?: boolean;
  /** A one-shot trigger that just fired. */
  sent?: boolean;
  shortcut?: string;
}>();
defineEmits<{ press: [] }>();

const tagText = computed(() => {
  if (props.armed) return `ARMED · ${props.tag}`;
  if (props.sent) return `SENT · ${props.tag}`;
  return `→ ${props.tag}`;
});
</script>

<template>
  <button
    type="button"
    class="tile"
    :class="{ on: armed || sent }"
    :aria-pressed="armed"
    @click="$emit('press')"
  >
    <span class="label">
      {{ label }}
      <kbd v-if="shortcut" class="mono" aria-hidden="true">{{ shortcut }}</kbd>
    </span>
    <span class="tag mono">{{ tagText }}</span>
  </button>
</template>

<style scoped>
.tile {
  min-height: 76px;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  text-align: left;
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-card);
}

.tile.on {
  background: var(--color-atc-bg);
  border: 2px solid var(--color-atc);
  padding: calc(var(--space-3) - 1px);
}

.label {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

kbd {
  font-size: 11px;
  color: var(--color-text-faint);
}

.tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.tile.on .tag {
  color: var(--color-atc);
}
</style>
