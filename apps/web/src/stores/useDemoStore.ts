import type {
  CurrentSessionResponse,
  DemoTriggerName,
  DemoTriggerResponse,
  FaultConfig,
  ResetSessionResponse,
  SessionStats,
} from '@towerwhisper/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../utils/api';

/** Demo-panel fault configuration (synced via demo:faults), the session and its statistics. */
export const useDemoStore = defineStore('demo', () => {
  const faults = ref<FaultConfig | null>(null);
  const stats = ref<SessionStats | null>(null);
  const session = ref<CurrentSessionResponse | null>(null);
  const overlayVisible = ref(false);

  function setFaults(config: FaultConfig): void {
    faults.value = config;
  }

  function setStats(next: SessionStats): void {
    stats.value = next;
  }

  function setOverlay(visible: boolean): void {
    overlayVisible.value = visible;
  }

  async function loadSession(): Promise<void> {
    session.value = await api<CurrentSessionResponse>('GET', '/sessions/current');
  }

  /** Session ids change on reset; the socket tells every screen. */
  function setSession(sessionId: string, startedAt: string): void {
    if (session.value) session.value = { ...session.value, sessionId, startedAt };
    stats.value = null;
  }

  /** PUT /demo/faults with a patch; the server answers (and broadcasts) the new config. */
  async function update(patch: Partial<FaultConfig>): Promise<void> {
    const current = faults.value ?? (await api<FaultConfig>('GET', '/demo/faults'));
    faults.value = await api<FaultConfig>('PUT', '/demo/faults', { ...current, ...patch });
  }

  function trigger(name: DemoTriggerName, body: object = {}): Promise<DemoTriggerResponse> {
    return api<DemoTriggerResponse>('POST', `/demo/triggers/${name}`, body);
  }

  async function refreshStats(): Promise<void> {
    if (!session.value) await loadSession();
    if (session.value)
      stats.value = await api<SessionStats>('GET', `/sessions/${session.value.sessionId}/stats`);
  }

  async function resetScenario(): Promise<void> {
    if (!session.value) await loadSession();
    if (!session.value) return;
    const { sessionId } = await api<ResetSessionResponse>(
      'POST',
      `/sessions/${session.value.sessionId}/reset`,
    );
    session.value = { ...session.value, sessionId };
  }

  return {
    faults,
    stats,
    session,
    overlayVisible,
    setFaults,
    setStats,
    setOverlay,
    loadSession,
    setSession,
    update,
    trigger,
    refreshStats,
    resetScenario,
  };
});
