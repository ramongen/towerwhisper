<script setup lang="ts">
import type { Alert, ReplaySession, ReplaySessionSummary } from '@towerwhisper/shared';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertStack from '../../components/AlertStack.vue';
import CommsPanel from '../../components/CommsPanel.vue';
import FlightStrip from '../../components/FlightStrip.vue';
import RadarScope from '../../components/RadarScope.vue';
import ReplayTimeline from '../../components/supervisor/ReplayTimeline.vue';
import { unlockAudioOnGesture } from '../../composables/audioContext';
import { MAX_VOICE_SPEED, SPEEDS, useReplayPlayer } from '../../composables/useReplayPlayer';
import { watchSector } from '../../composables/useSocket';
import { useAlertStore } from '../../stores/useAlertStore';
import { useSectorStore } from '../../stores/useSectorStore';
import { useTrafficStore } from '../../stores/useTrafficStore';
import { api, setApiSector } from '../../utils/api';
import { REPLAY_LEAD_S } from '../../utils/replay';
import { alertLabel, clock, duration, utcDateTime, utcTime } from '../../utils/format';

/** NO_CONTACT colours in the replay use the default limits (30 / 60 min). */
const LIMITS = { cautionS: 1800, warningS: 3600 };

const route = useRoute();
const router = useRouter();
const sectors = useSectorStore();
const traffic = useTrafficStore();
const { aircraft, selectedCallsign } = storeToRefs(traffic);
const { levelByCallsign } = storeToRefs(useAlertStore());
const player = useReplayPlayer();
const { session, t, start, end, playing, speed, voices, voiceActive } = player;

const sectorId = ref<string>(
  typeof route.query.sector === 'string' ? route.query.sector : 'craiova-app',
);
const sessions = ref<ReplaySessionSummary[]>([]);
const listError = ref<string | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const selectedId = ref<string | null>(
  typeof route.query.session === 'string' ? route.query.session : null,
);

async function loadSessions(): Promise<void> {
  try {
    sessions.value = await api<ReplaySessionSummary[]>(
      'GET',
      `/replay/sessions?sector=${sectorId.value}`,
    );
    listError.value = null;
  } catch (e) {
    listError.value = (e as Error).message;
  }
}

/** The alert the replay was opened for (from the alert history), shown above the radar. */
const focus = ref<Alert | null>(null);

async function open(id: string, atMs?: number, alertId?: string): Promise<void> {
  selectedId.value = id;
  focus.value = null;
  void router.replace({ query: { sector: sectorId.value, session: id } });
  loading.value = true;
  loadError.value = null;
  try {
    const replay = await api<ReplaySession>('GET', `/replay/sessions/${id}`);
    // The scope centres on the session's sector and reads its airspace.
    setApiSector(replay.sector.id);
    sectors.joined({
      sector: replay.sector,
      sessionId: replay.session.id,
      startedAt: replay.session.startedAt,
      access: 'view',
    });
    const alert = alertId ? replay.alerts.find((a) => a.id === alertId) : undefined;
    player.load(replay, atMs);
    if (alert) {
      focus.value = alert;
      traffic.select(alert.callsigns[0] ?? null);
    }
  } catch (e) {
    loadError.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

watch(sectorId, () => {
  selectedId.value = null;
  player.unload();
  void router.replace({ query: { sector: sectorId.value } });
  void loadSessions();
});

function onKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  if (!session.value) return;
  if (event.code === 'Space') {
    event.preventDefault();
    player.toggle();
  } else if (event.key === 'ArrowLeft') {
    player.skip(event.shiftKey ? -60 : -10);
  } else if (event.key === 'ArrowRight') {
    player.skip(event.shiftKey ? 60 : 10);
  }
}

onMounted(async () => {
  watchSector(null); // the replay owns the screen: no live sector feeds the stores
  unlockAudioOnGesture();
  window.addEventListener('keydown', onKey);
  void sectors.loadAll().catch(() => undefined);
  await loadSessions();
  // Opened from an alert: that session, just before the alert (even if it is an old session
  // beyond the list).
  const at = Number(route.query.at);
  const alertId = typeof route.query.alert === 'string' ? route.query.alert : undefined;
  if (selectedId.value) void open(selectedId.value, Number.isFinite(at) ? at : undefined, alertId);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  player.unload();
  sectors.leave();
  setApiSector(null);
});

const elapsed = computed(() => clock((t.value - start.value) / 1000));
const total = computed(() => clock((end.value - start.value) / 1000));
const sectorName = computed(() => sectors.byId(sectorId.value)?.name ?? sectorId.value);

function toggleSelect(callsign: string): void {
  traffic.select(selectedCallsign.value === callsign ? null : callsign);
}
</script>

<template>
  <div class="replay">
    <aside class="sidebar" aria-label="Recorded sessions">
      <label class="field">
        <span class="label">Sector</span>
        <select v-model="sectorId">
          <option v-for="s in sectors.all" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
      <div class="list-head">
        <h2 class="section-title">SESSIONS</h2>
        <button type="button" class="refresh" title="Refresh the list" @click="loadSessions">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <path
              d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
      <p v-if="listError" class="empty">Unavailable: {{ listError }}</p>
      <p v-else-if="!sessions.length" class="empty">No recorded session in {{ sectorName }} yet.</p>
      <ul class="sessions">
        <li v-for="s in sessions" :key="s.id">
          <button
            type="button"
            class="session"
            :class="{ on: s.id === selectedId }"
            :aria-current="s.id === selectedId"
            @click="open(s.id)"
          >
            <span class="row">
              <span class="when mono">{{ utcDateTime(s.startedAt) }}</span>
              <span v-if="s.live" class="live mono">LIVE</span>
              <span
                v-else-if="!s.hasRadar"
                class="no-radar mono"
                title="Recorded before radar replay existed"
              >
                NO RADAR
              </span>
            </span>
            <span class="meta mono">
              {{ duration(s.durationS) }} · {{ s.transmissions }} TX ·
              <span :class="{ alerting: s.alerts }">{{ s.alerts }} ALERTS</span>
            </span>
          </button>
        </li>
      </ul>
    </aside>

    <section class="player" aria-label="Replay">
      <div v-if="!session" class="placeholder">
        <svg
          width="56"
          height="56"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" />
        </svg>
        <p v-if="loading" class="mono">LOADING THE RECORDING…</p>
        <p v-else-if="loadError">Recording unavailable: {{ loadError }}</p>
        <template v-else>
          <p class="big">Pick a session to replay</p>
          <p>
            Radar, transmissions, pilot and controller voices and alerts, on a timeline you can
            scrub.
          </p>
        </template>
      </div>

      <template v-else>
        <header class="info">
          <div class="title">
            <span class="name">{{ session.sector.name }}</span>
            <span class="mono sub">
              {{ utcDateTime(session.session.startedAt) }} UTC ·
              {{ duration(session.session.durationS) }}
              <template v-if="session.session.live">
                · RECORDED UNTIL {{ utcTime(end) }} UTC</template
              >
            </span>
          </div>
          <span class="mono badge">REPLAY · READ ONLY</span>
        </header>

        <div class="body">
          <div class="radar">
            <RadarScope :key="session.session.id" />
            <div v-if="focus" class="focus" :class="focus.severity" role="status">
              <svg
                v-if="focus.severity === 'warning'"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 3l10 18H2z" fill="currentColor" />
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="currentColor" />
              </svg>
              <span class="focus-type mono"
                >{{ alertLabel(focus.type) }} · {{ utcTime(focus.raisedAt) }}</span
              >
              <span class="focus-msg">{{ focus.message }}</span>
              <button
                type="button"
                class="focus-again"
                title="Back to just before this alert"
                @click="player.seek(Date.parse(focus.raisedAt) - REPLAY_LEAD_S * 1000)"
              >
                Replay again
              </button>
              <button type="button" class="focus-close" aria-label="Hide" @click="focus = null">
                ×
              </button>
            </div>
            <div v-if="!session.session.hasRadar" class="no-radar-note">
              <span class="mono">NO RADAR RECORDING</span>
              <span
                >This session was recorded before radar replay existed: transcripts, voices and
                alerts only.</span
              >
            </div>
          </div>
          <aside class="side">
            <CommsPanel class="comms" />
            <AlertStack class="alerts" />
          </aside>
        </div>

        <div class="strips">
          <FlightStrip
            v-for="a in aircraft"
            :key="a.callsign"
            :aircraft="a"
            :selected="a.callsign === selectedCallsign"
            :alert-level="levelByCallsign.get(a.callsign)"
            :limits="LIMITS"
            @select="toggleSelect"
          />
        </div>

        <footer class="transport">
          <div class="controls">
            <button type="button" class="icon" title="Back 10 s (←)" @click="player.skip(-10)">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path
                  d="M11 7l-5 5 5 5M18 7l-5 5 5 5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span class="visually-hidden">Back 10 seconds</span>
            </button>
            <button
              type="button"
              class="play"
              :aria-label="playing ? 'Pause' : 'Play'"
              title="Play / pause (Space)"
              @click="player.toggle()"
            >
              <svg v-if="playing" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5l11 7-11 7z" fill="currentColor" />
              </svg>
            </button>
            <button type="button" class="icon" title="Forward 10 s (→)" @click="player.skip(10)">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path
                  d="M13 7l5 5-5 5M6 7l5 5-5 5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span class="visually-hidden">Forward 10 seconds</span>
            </button>
            <span class="time mono">
              <span class="now">{{ utcTime(t) }}</span>
              <span class="of">{{ elapsed }} / {{ total }}</span>
            </span>
          </div>

          <ReplayTimeline
            class="bar"
            :start="start"
            :end="end"
            :t="t"
            :alerts="session.alerts"
            :comms="session.comms"
            @seek="player.seek"
          />

          <div class="options">
            <div class="segmented mono" role="group" aria-label="Replay speed">
              <button
                v-for="s in SPEEDS"
                :key="s"
                type="button"
                :class="{ on: speed === s }"
                :aria-pressed="speed === s"
                @click="speed = s"
              >
                {{ s }}×
              </button>
            </div>
            <button
              type="button"
              class="voice"
              :class="{ on: voiceActive }"
              :aria-pressed="voices"
              :title="
                speed > MAX_VOICE_SPEED
                  ? `Voices play at ${MAX_VOICE_SPEED}× or slower`
                  : 'Pilot and controller voices'
              "
              @click="voices = !voices"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
                <path
                  v-if="voiceActive"
                  d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"
                  stroke-linecap="round"
                />
                <path v-else d="M16 9l5 6M21 9l-5 6" stroke-linecap="round" />
              </svg>
              {{
                voiceActive
                  ? 'VOICES'
                  : speed > MAX_VOICE_SPEED
                    ? `VOICES ≤ ${MAX_VOICE_SPEED}×`
                    : 'MUTED'
              }}
            </button>
          </div>
        </footer>
      </template>
    </section>
  </div>
</template>

<style scoped>
.replay {
  height: 100%;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
}

.sidebar {
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-5) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--color-panel);
  border-right: var(--border-width) solid var(--color-border);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

select {
  height: 40px;
  padding: 0 var(--space-3);
  font-size: 14px;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-3);
}

.refresh {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.sessions {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.session {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px var(--space-3);
  text-align: left;
  background: transparent;
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius);
}

.session:hover {
  border-color: var(--color-text-muted);
}

.session.on {
  border-color: var(--color-atc);
  background: var(--color-atc-selected-bg);
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.when {
  font-size: 14px;
  font-weight: 600;
}

.live {
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-ok);
  border: var(--border-width) solid var(--color-ok);
  border-radius: var(--radius-sm);
}

.meta {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.alerting {
  color: var(--color-caution);
}

.empty {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-faint);
}

.player {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  text-align: center;
}

.placeholder p {
  margin: 0;
  max-width: 420px;
  font-size: 14px;
}

.placeholder .big {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.info {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-5);
  border-bottom: var(--border-width) solid var(--color-border);
}

.title {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.name {
  font-size: 17px;
  font-weight: 700;
}

.sub {
  font-size: 13px;
  color: var(--color-text-muted);
}

.badge {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-atc);
  background: var(--color-atc-bg);
  border: var(--border-width) solid var(--color-atc);
  border-radius: var(--radius);
}

.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 560px;
}

.radar {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border-right: var(--border-width) solid var(--color-border);
}

.focus {
  position: absolute;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  max-width: calc(100% - 48px);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 14px;
  font-size: 15px;
  background: var(--color-panel-overlay);
  border: var(--border-width) solid currentColor;
  border-radius: var(--radius-card);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.focus.caution {
  color: var(--color-caution);
}

.focus.warning {
  color: var(--color-warning-text);
}

.focus-type {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.focus-msg {
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-again,
.focus-close {
  height: 30px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
  white-space: nowrap;
}

.focus-again {
  padding: 0 var(--space-3);
}

.focus-close {
  width: 30px;
  font-size: 18px;
  line-height: 1;
}

.no-radar-note {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-size: 15px;
  color: var(--color-text-secondary);
  background: rgba(7, 12, 18, 0.72);
  pointer-events: none;
}

.no-radar-note .mono {
  font-size: 13px;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
}

.no-radar {
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius-sm);
}

.side {
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-panel);
}

.comms {
  flex: 1 1 auto;
  min-height: 0;
  border-bottom: var(--border-width) solid var(--color-border);
}

.alerts {
  flex: 0 0 300px;
  min-height: 0;
}

.strips {
  flex: none;
  height: 132px;
  padding: 10px var(--space-4);
  display: flex;
  gap: var(--space-3);
  overflow-x: auto;
  background: var(--color-strips-bg);
  border-top: var(--border-width) solid var(--color-border);
}

.transport {
  flex: none;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-5);
  padding: 14px var(--space-5) 10px;
  background: var(--color-panel);
  border-top: var(--border-width) solid var(--color-border-strong);
}

.controls,
.options {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 52px;
}

.icon,
.play {
  display: grid;
  place-items: center;
  border-radius: 50%;
}

.icon {
  width: 38px;
  height: 38px;
  color: var(--color-text-secondary);
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
}

.play {
  width: 48px;
  height: 48px;
  color: var(--color-radar-bg);
  background: var(--color-atc);
  border: none;
}

.time {
  display: flex;
  flex-direction: column;
  margin-left: var(--space-2);
  line-height: 1.2;
}

.now {
  font-size: 20px;
  font-weight: 600;
}

.of {
  font-size: 12px;
  color: var(--color-text-muted);
}

.segmented {
  display: flex;
  padding: 3px;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.segmented button {
  height: 30px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
}

.segmented button.on {
  color: var(--color-text);
  background: var(--color-border-strong);
}

.voice {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 var(--space-3);
  font-family: var(--font-data);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.voice.on {
  color: var(--color-atc);
  border-color: var(--color-atc);
}
</style>
