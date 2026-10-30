<script setup lang="ts">
import DemoPanel from '../components/DemoPanel.vue';
import { useSocket } from '../composables/useSocket';

// Opened on a phone during the pitch; must never need the microphone.
const { connected } = useSocket();
</script>

<template>
  <div class="demo">
    <header class="panel header">
      <strong>DEMO CONTROL</strong>
      <span class="mono">{{ connected ? '● CONNECTED' : '○ DISCONNECTED' }}</span>
    </header>
    <section class="panel">
      <DemoPanel />
    </section>
  </div>
</template>

<style scoped>
.demo {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 480px;
  margin: 0 auto;
  padding: var(--space-4);
}

.header {
  display: flex;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
}
</style>
