import type { SectorInfo, SectorJoinedPayload } from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../utils/api';

/**
 * The sector this screen follows (sent by the server in sector:joined) and the list of every
 * sector. `access` is 'control' for the sector's ATC, 'view' for a supervisor or the demo panel.
 */
export const useSectorStore = defineStore('sector', () => {
  const current = ref<SectorInfo | null>(null);
  const access = ref<'control' | 'view'>('view');
  const all = ref<SectorInfo[]>([]);

  const readonly = computed(() => access.value !== 'control');

  function joined(payload: SectorJoinedPayload): void {
    current.value = payload.sector;
    access.value = payload.access;
  }

  function leave(): void {
    current.value = null;
    access.value = 'view';
  }

  async function loadAll(): Promise<SectorInfo[]> {
    if (!all.value.length) all.value = await api<SectorInfo[]>('GET', '/sectors');
    return all.value;
  }

  function byId(id: string | null | undefined): SectorInfo | undefined {
    return all.value.find((s) => s.id === id);
  }

  return { current, access, all, readonly, joined, leave, loadAll, byId };
});
