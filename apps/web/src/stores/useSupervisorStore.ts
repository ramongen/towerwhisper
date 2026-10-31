import type {
  AnalyticsRange,
  SectorOverview,
  SupervisorAnalytics,
  SupervisorOverviewPayload,
} from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../utils/api';

/** The live overview of every sector (pushed by the socket) and the statistics of a range. */
export const useSupervisorStore = defineStore('supervisor', () => {
  const sectors = ref<SectorOverview[]>([]);
  const overviewAt = ref<string | null>(null);
  const analytics = ref<SupervisorAnalytics | null>(null);
  const range = ref<AnalyticsRange>('24h');
  /** 'all' or a sector id. */
  const sectorFilter = ref<string>('all');
  const loading = ref(false);
  const error = ref<string | null>(null);

  function setOverview(payload: SupervisorOverviewPayload): void {
    sectors.value = payload.sectors;
    overviewAt.value = payload.at;
  }

  async function loadAnalytics(): Promise<void> {
    loading.value = true;
    try {
      analytics.value = await api<SupervisorAnalytics>(
        'GET',
        `/supervisor/analytics?range=${range.value}&sector=${sectorFilter.value}`,
      );
      error.value = null;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  const activeAlerts = computed(() => sectors.value.flatMap((s) => s.activeAlerts));

  return {
    sectors,
    overviewAt,
    analytics,
    range,
    sectorFilter,
    loading,
    error,
    activeAlerts,
    setOverview,
    loadAnalytics,
  };
});
