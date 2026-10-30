<script setup lang="ts">
import DemoPanel from '../components/DemoPanel.vue';
import { useSocket } from '../composables/useSocket';

// Opened on a phone during the pitch; must never need the microphone.
useSocket();
</script>

<template>
  <main class="demo-view">
    <DemoPanel />
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
