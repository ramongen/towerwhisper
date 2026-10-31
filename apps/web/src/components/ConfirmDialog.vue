<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps<{
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const confirmButton = ref<HTMLButtonElement | null>(null);

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('cancel');
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  confirmButton.value?.focus();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="backdrop" @click.self="emit('cancel')">
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title">{{ title }}</h2>
      <p>{{ message }}</p>
      <div class="actions">
        <button type="button" class="secondary" @click="emit('cancel')">Cancel</button>
        <button
          ref="confirmButton"
          type="button"
          class="primary"
          :disabled="busy"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-overlay);
}

.dialog {
  width: 480px;
  max-width: calc(100% - 32px);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-dialog);
}

h2 {
  margin: 0;
  font-size: 20px;
}

p {
  margin: 0;
  font-size: var(--font-size-alert);
  line-height: 1.45;
  color: var(--color-text-secondary);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

button {
  min-height: 44px;
  padding: 0 var(--space-5);
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.secondary {
  color: var(--color-text-secondary);
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
}

.primary {
  color: var(--color-ok);
  background: transparent;
  border: var(--border-width) solid var(--color-ok);
}

.primary:disabled {
  opacity: 0.5;
}
</style>
