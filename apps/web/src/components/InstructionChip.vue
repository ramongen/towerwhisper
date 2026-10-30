<script setup lang="ts">
defineProps<{ text: string; bad?: boolean; muted?: boolean }>();
</script>

<template>
  <span class="chip mono" :class="{ bad, muted }">{{ text }}</span>
</template>

<style scoped>
.chip {
  padding: 3px var(--space-2);
  font-size: 13px;
  color: var(--color-text);
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-chip);
  border-radius: var(--radius);
  white-space: nowrap;
}

.chip.bad {
  color: var(--color-warning-text);
  background: var(--color-warning-bg);
  border-color: var(--color-warning);
}

.chip.muted {
  color: var(--color-text-muted);
  border-style: dashed;
}
</style>
