<script setup lang="ts">
import type { DemoSessionInfo } from '@towerwhisper/shared';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import DemoPanel from '../components/DemoPanel.vue';
import DemoSessionPicker from '../components/DemoSessionPicker.vue';
import { watchSector } from '../composables/useSocket';
import { api } from '../utils/api';

/** Who is in which session changes as people sign in and out. */
const SESSIONS_POLL_MS = 4000;
const STORAGE_KEY = 'towerwhisper.demoSector';

// Opened on a phone during the pitch; must never need the microphone or a login.
const sessions = ref<DemoSessionInfo[]>([]);
const selected = ref<string | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;

function saved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function pick(sectorId: string): void {
  selected.value = sectorId;
  watchSector(sectorId);
  try {
    localStorage.setItem(STORAGE_KEY, sectorId);
  } catch {
    // Not remembered; the panel still works.
  }
}

async function load(): Promise<void> {
  try {
    sessions.value = await api<DemoSessionInfo[]>('GET', '/demo/sessions');
  } catch {
    return; // offline for a moment: keep the last list
  }
  if (selected.value) return;
  // The last sector used here, else one an ATC is working, else the first.
  const ids = sessions.value.map((s) => s.sector.id);
  const remembered = saved();
  const staffed = sessions.value.find((s) => s.users.some((u) => u.role === 'atc'));
  const first =
    remembered && ids.includes(remembered) ? remembered : (staffed?.sector.id ?? ids[0]);
  if (first) pick(first);
}

onMounted(() => {
  void load();
  timer = setInterval(() => void load(), SESSIONS_POLL_MS);
});

onBeforeUnmount(() => {
  clearInterval(timer);
  watchSector(null);
});
</script>

<template>
  <main class="demo-view">
    <DemoSessionPicker :sessions="sessions" :selected="selected" @pick="pick" />
    <DemoPanel v-if="selected" :key="selected" />
  </main>
</template>

<style scoped>
.demo-view {
  max-width: 480px;
  min-height: 100%;
  margin: 0 auto;
  background: var(--color-bg);
}
</style>
