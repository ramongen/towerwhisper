<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useAlertStore } from '../stores/useAlertStore';

const { active } = storeToRefs(useAlertStore());

const pending = computed(() => active.value.filter((a) => !a.acknowledgedAt));
const warnings = computed(() => pending.value.filter((a) => a.severity === 'warning').length);
</script>

<template>
  <div
    v-if="pending.length"
    class="unacked"
    :class="{ caution: warnings === 0 }"
    role="status"
    aria-live="assertive"
  >
    <span class="pulse" aria-hidden="true" />
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linejoin="round"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M12 3l10 18H2z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17.5" x2="12" y2="17.6" />
    </svg>
    <span class="mono count">{{ pending.length }}</span>
    <span class="mono label">{{ pending.length === 1 ? 'ALERT' : 'ALERTS' }} NOT ACKNOWLEDGED</span>
  </div>
</template>

<style scoped>
.unacked {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 10px 14px;
  color: var(--color-warning);
  background: var(--color-warning-strong-bg);
  border: var(--border-width) solid var(--color-warning);
  border-radius: var(--radius-card);
  box-shadow: 0 0 24px rgba(255, 93, 93, 0.25);
  animation: urgent 1.2s ease-in-out infinite;
}

.unacked.caution {
  color: var(--color-caution);
  background: var(--color-caution-strong-bg);
  border-color: var(--color-caution);
  box-shadow: none;
  animation: none;
}

.pulse {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: currentColor;
  animation: blink 1.2s ease-in-out infinite;
}

.count {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

.label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

@keyframes urgent {
  50% {
    box-shadow: 0 0 36px rgba(255, 93, 93, 0.45);
  }
}

@keyframes blink {
  50% {
    opacity: 0.25;
  }
}

@media (prefers-reduced-motion: reduce) {
  .unacked,
  .pulse {
    animation: none;
  }
}
</style>
