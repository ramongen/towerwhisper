<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DesktopOnly from './components/DesktopOnly.vue';
import { connectSocket, disconnectSocket } from './composables/useSocket';
import { useAuthStore } from './stores/useAuthStore';
import { onApiUnauthorized } from './utils/api';
import { SMALL_SCREEN_QUERY } from './utils/screen';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

// A window made too small after loading: cover the app (the demo panel is fine anywhere).
const media = window.matchMedia(SMALL_SCREEN_QUERY);
const small = ref(media.matches);
const onMedia = (event: MediaQueryListEvent) => (small.value = event.matches);
const blocked = computed(() => small.value && route.name !== 'demo');

/**
 * One socket for the whole app: the demo panel connects without an account (it picks a
 * sector itself); every other page with the user's token; the login page without one.
 */
watch(
  () => [route.name, auth.token] as const,
  ([name, token]) => {
    if (name === undefined) return; // before the first navigation
    if (name === 'demo') connectSocket(null);
    else if (token && name !== 'login') connectSocket(token);
    else disconnectSocket();
  },
  { immediate: true },
);

onApiUnauthorized(() => {
  auth.logout();
  void router.push({ name: 'login' });
});

onMounted(() => {
  media.addEventListener('change', onMedia);
  // The account may have changed since the last visit (role, sector).
  void auth.refresh();
});
onBeforeUnmount(() => media.removeEventListener('change', onMedia));
</script>

<template>
  <RouterView v-show="!blocked" />
  <DesktopOnly v-if="blocked" />
</template>
