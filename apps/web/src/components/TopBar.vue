<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useNow } from '../composables/useNow';
import { useCommsStore } from '../stores/useCommsStore';
import { useSectorStore } from '../stores/useSectorStore';
import UserMenu from './UserMenu.vue';
import { useDemoStore } from '../stores/useDemoStore';
import { useWeatherStore } from '../stores/useWeatherStore';
import { formatAge, utcTime } from '../utils/format';

defineProps<{ connected: boolean }>();

const now = useNow();
const { frequencyBusy } = storeToRefs(useCommsStore());
const { session } = storeToRefs(useDemoStore());
const { current: weather } = storeToRefs(useWeatherStore());
const { current: sector, readonly } = storeToRefs(useSectorStore());

/** Into the wind, from the live METAR; the ILS runway until the first observation. */
const runwayInUse = computed(
  () => weather.value?.preferredRunway ?? sector.value?.ilsRunway ?? '—',
);

/** Where PTT audio is transcribed. */
const sttLabel = computed(() => {
  switch (session.value?.stt) {
    case 'local-whisper':
      return { text: 'STT WHISPER LOCAL', title: 'Whisper large-v3 on this machine (GPU)' };
    case 'openai':
      return { text: 'STT WHISPER API', title: 'OpenAI Whisper API' };
    case 'none':
      return { text: 'TEXT MODE', title: 'No speech-to-text configured: typed transmissions' };
    default:
      return null;
  }
});

const sessionClock = computed(() => {
  if (!session.value) return '--:--:--';
  const s = Math.max(0, Math.floor((now.value - Date.parse(session.value.startedAt)) / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${formatAge(s % 3600)}`;
});
</script>

<template>
  <header class="topbar">
    <slot name="start" />
    <div class="position">
      <span class="name">{{ sector?.name.toUpperCase() ?? 'CONNECTING…' }}</span>
      <span class="mono sub"
        >{{ sector?.airportIcao ?? '----' }} · RWY {{ runwayInUse }} IN USE</span
      >
    </div>
    <span
      v-if="readonly && sector"
      class="mono view-only"
      title="You see this sector live but cannot transmit or resolve alerts"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      READ ONLY
    </span>
    <div class="spacer" />
    <div class="mono frequency" :class="{ busy: frequencyBusy }" role="status">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4" />
      </svg>
      <span>{{ frequencyBusy ? 'FREQUENCY BUSY' : 'FREQUENCY IDLE' }}</span>
    </div>
    <span v-if="sttLabel && !readonly" class="mono mode" :title="sttLabel.title">{{
      sttLabel.text
    }}</span>
    <span class="mono sub">SESSION {{ sessionClock }}</span>
    <span class="mono clock">{{ utcTime(now) }} UTC</span>
    <div class="connection" :class="{ down: !connected }" role="status">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4" />
      </svg>
      <span>{{ connected ? 'Connected' : 'Disconnected' }}</span>
    </div>
    <UserMenu />
  </header>
</template>

<style scoped>
.topbar {
  height: var(--topbar-height);
  white-space: nowrap;
  padding: 0 var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-5);
  background: var(--color-panel);
  border-bottom: var(--border-width) solid var(--color-border);
}

.position {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.sub {
  font-size: 14px;
  color: var(--color-text-muted);
}

.spacer {
  flex-grow: 1;
}

.frequency {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px var(--space-3);
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  border: var(--border-width) solid var(--color-border-strong);
  fill: var(--color-idle);
}

.frequency.busy {
  color: var(--color-warning);
  background: var(--color-warning-strong-bg);
  border-color: var(--color-warning);
  fill: var(--color-warning);
}

.mode {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.clock {
  font-size: 18px;
  font-weight: 600;
}

.connection {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
  color: var(--color-text-muted);
  fill: var(--color-ok);
}

.connection.down {
  color: var(--color-warning);
  fill: var(--color-warning);
}

.view-only {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-atc);
  background: var(--color-atc-bg);
  border: var(--border-width) solid var(--color-atc);
  border-radius: var(--radius);
}
</style>
