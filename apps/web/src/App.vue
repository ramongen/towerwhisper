<script setup lang="ts">
import { useSocket } from './composables/useSocket';

// One socket for the whole app; it fills the stores for every route.
useSocket();
</script>

<template>
  <RouterView />
</template>
