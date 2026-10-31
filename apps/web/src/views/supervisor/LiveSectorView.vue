<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { watchSector } from '../../composables/useSocket';
import { useSectorStore } from '../../stores/useSectorStore';
import ControllerView from '../ControllerView.vue';

/**
 * A supervisor looking over a controller's shoulder: the sector's own screen, live and
 * read-only (aircraft can be selected, details and weather read; nothing can be sent).
 */
const route = useRoute();
const router = useRouter();
const sectors = useSectorStore();

watch(
  () => route.params.sectorId,
  (id) => {
    if (typeof id === 'string') watchSector(id);
  },
  { immediate: true },
);

onMounted(() => void sectors.loadAll().catch(() => undefined));
onBeforeUnmount(() => watchSector(null));

function switchTo(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  void router.replace({ name: 'supervisor-live', params: { sectorId: id } });
}
</script>

<template>
  <ControllerView>
    <template #back>
      <RouterLink
        :to="{ name: 'supervisor' }"
        class="back"
        title="Back to the supervisor dashboard"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Dashboard
      </RouterLink>
      <label class="switch">
        <span class="visually-hidden">Watch another sector</span>
        <select :value="route.params.sectorId" @change="switchTo">
          <option v-for="s in sectors.all" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
    </template>
  </ControllerView>
</template>

<style scoped>
.back {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 var(--space-3) 0 var(--space-2);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-decoration: none;
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.back:hover {
  color: var(--color-text);
  border-color: var(--color-text-muted);
}

.switch select {
  height: 34px;
  padding: 0 var(--space-3);
  font-size: 14px;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}
</style>
