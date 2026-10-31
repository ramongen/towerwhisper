<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useTrafficStore } from '../stores/useTrafficStore';

/**
 * The suggested next call for one aircraft, opened from its NEXT CALL chip on the scope:
 * what to say, why, and what the advice is based on. Follows the live advisory (the server
 * recomputes it every tick); when the advice is gone (it was given, or no longer applies)
 * the card says so. Advice only: nothing is transmitted from here.
 */
const props = defineProps<{ callsign: string }>();
const emit = defineEmits<{ close: []; seen: [id: string] }>();

const { aircraft } = storeToRefs(useTrafficStore());
const live = computed(() => aircraft.value.find((a) => a.callsign === props.callsign) ?? null);
const advisory = computed(() => live.value?.advisory ?? null);

// While the card is open, every new advice for this aircraft counts as seen.
watch(
  () => advisory.value?.id,
  (id) => id && emit('seen', id),
  { immediate: true },
);

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <section
    class="advisory-card"
    :class="{ urgent: advisory?.urgency === 'urgent' }"
    role="dialog"
    :aria-label="`Suggested next call for ${callsign}`"
    @pointerdown.stop
    @click.stop
    @wheel.stop
  >
    <header class="head">
      <div class="ident">
        <span class="kicker mono">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 0l6 6-6 6-6-6z" fill="currentColor" />
          </svg>
          {{ advisory?.urgency === 'urgent' ? 'NEXT CALL · NOW' : 'SUGGESTED NEXT CALL' }}
        </span>
        <span class="callsign mono">{{ callsign }}</span>
      </div>
      <button type="button" class="close" aria-label="Close" title="Close (Esc)" @click="emit('close')">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <template v-if="advisory">
      <h3 class="title">{{ advisory.title }}</h3>
      <div class="say">
        <span class="label mono">SAY</span>
        <p class="phrase mono">“{{ advisory.phrase }}”</p>
      </div>
      <div class="why">
        <span class="label mono">WHY</span>
        <p class="reason">{{ advisory.reason }}</p>
      </div>
      <div v-if="advisory.basis.length" class="basis">
        <span class="label mono">BASED ON</span>
        <ul class="mono">
          <li v-for="(b, i) in advisory.basis" :key="i">{{ b }}</li>
        </ul>
      </div>
    </template>
    <p v-else-if="live" class="done">
      No call needed right now: the advice was given, or no longer applies.
    </p>
    <p v-else class="done">{{ callsign }} is no longer on the scope.</p>

    <footer class="foot">Advisory only · you decide and transmit</footer>
  </section>
</template>

<style scoped>
.advisory-card {
  width: 420px;
  min-height: 0; /* shrinks inside its anchor, then scrolls */
  overflow-y: auto;
  padding: 14px var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--color-panel-overlay);
  border: var(--border-width) solid var(--color-atc);
  border-radius: var(--radius-card);
  backdrop-filter: blur(2px);
  cursor: default;
}

.advisory-card.urgent {
  border-color: var(--color-caution);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.ident {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-caption);
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--color-atc);
}

.urgent .kicker {
  color: var(--color-caution);
}

.callsign {
  font-size: 22px;
  font-weight: 700;
}

.close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  background: transparent;
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: 16px;
}

.title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.label {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}

.say {
  padding: var(--space-3);
  background: var(--color-atc-bg);
  border: var(--border-width) solid var(--color-atc);
  border-radius: var(--radius);
}

.urgent .say {
  background: var(--color-caution-bg);
  border-color: var(--color-caution);
}

.phrase {
  margin: 0;
  font-size: var(--font-size-alert);
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-text);
}

.reason {
  margin: 0;
  font-size: var(--font-size-alert);
  line-height: 1.45;
  color: var(--color-text-secondary);
}

.basis ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-size-data);
  line-height: 1.4;
  color: var(--color-text-secondary);
}

.done {
  margin: 0;
  font-size: var(--font-size-alert);
  line-height: 1.45;
  color: var(--color-text-muted);
}

.foot {
  font-size: var(--font-size-caption);
  color: var(--color-text-faint);
}
</style>
