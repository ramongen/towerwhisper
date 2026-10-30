<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useNow } from '../composables/useNow';
import { useCommsStore } from '../stores/useCommsStore';
import { useDemoStore } from '../stores/useDemoStore';
import { formatAge, utcTime } from '../utils/format';

defineProps<{ connected: boolean }>();

const now = useNow();
const { frequencyBusy } = storeToRefs(useCommsStore());
const { session } = storeToRefs(useDemoStore());

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
    <div class="position">
      <span class="name">CRAIOVA APPROACH</span>
      <span class="mono sub">LRCV · RWY 09 IN USE</span>
    </div>
    <div class="spacer" />
    <div class="mono frequency" :class="{ busy: frequencyBusy }" role="status">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4" />
      </svg>
      <span>{{ frequencyBusy ? 'FREQUENCY BUSY' : 'FREQUENCY IDLE' }}</span>
    </div>
    <span v-if="sttLabel" class="mono mode" :title="sttLabel.title">{{ sttLabel.text }}</span>
    <span class="mono sub">SESSION {{ sessionClock }}</span>
    <span class="mono clock">{{ utcTime(now) }} UTC</span>
    <div class="connection" :class="{ down: !connected }" role="status">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4" />
      </svg>
      <span>{{ connected ? 'Connected' : 'Disconnected' }}</span>
    </div>
    <span class="brand">TOWERWHISPER</span>
  </header>
</template>

<style scoped>
.topbar {
  height: var(--topbar-height);
  padding: 0 var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-6);
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

.brand {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}
</style>
