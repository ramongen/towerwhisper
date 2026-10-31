<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onMounted, watch } from 'vue';
import AircraftCard from '../components/AircraftCard.vue';
import AlertModal from '../components/AlertModal.vue';
import AlertStack from '../components/AlertStack.vue';
import CommsPanel from '../components/CommsPanel.vue';
import DemoPanel from '../components/DemoPanel.vue';
import FlightStrip from '../components/FlightStrip.vue';
import PttBar from '../components/PttBar.vue';
import RadarScope from '../components/RadarScope.vue';
import StatsOverlay from '../components/StatsOverlay.vue';
import TopBar from '../components/TopBar.vue';
import UnackedBadge from '../components/UnackedBadge.vue';
import WeatherPanel from '../components/WeatherPanel.vue';
import { unlockAudioOnGesture } from '../composables/audioContext';
import { useDemoShortcuts } from '../composables/useDemoShortcuts';
import { useRadioVoice } from '../composables/useRadioVoice';
import { useSocket } from '../composables/useSocket';
import { useAlertStore } from '../stores/useAlertStore';
import { useCommsStore } from '../stores/useCommsStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useDemoStore } from '../stores/useDemoStore';
import { useSectorStore } from '../stores/useSectorStore';
import { useTrafficStore } from '../stores/useTrafficStore';

/**
 * The controller's position: radar, comms, alerts, strips, PTT. A supervisor watching a
 * sector sees the same screen read-only (no PTT, no resolving, no demo shortcuts).
 */
const { connected, emitSelect } = useSocket();
const { current: sector, readonly } = storeToRefs(useSectorStore());
const auth = useAuthStore();
const unassigned = computed(() => auth.user?.role === 'atc' && !auth.user.sectorId);
const traffic = useTrafficStore();
const { aircraft, selectedCallsign } = storeToRefs(traffic);
const { levelByCallsign } = storeToRefs(useAlertStore());
const demo = useDemoStore();
const { faults, overlayVisible } = storeToRefs(demo);
const { drawerOpen } = useDemoShortcuts(computed(() => !readonly.value));

function closeOverlay(): void {
  void demo.trigger('stats-overlay', { visible: false }).catch(() => undefined);
}

const limits = computed(() => faults.value?.commsLimits ?? { cautionS: 1800, warningS: 3600 });

/** '30 MIN' or '15 S' for the radar legend. */
const limitText = (s: number) =>
  limits.value.cautionS < 120 ? `${s} S` : `${Math.round(s / 60)} MIN`;

// Demo faults with target "selected" follow the radar selection.
watch(selectedCallsign, (callsign) => emitSelect(callsign));

// The big screen speaks every new pilot readback through the radio filter.
const comms = useCommsStore();
const voice = useRadioVoice();
let spoken = 0;
watch(
  () => comms.entries.length,
  (length) => {
    if (length < spoken) spoken = 0; // session reset
    for (const entry of comms.entries.slice(spoken)) {
      // Only live readbacks are spoken; the history sent after a refresh stays silent.
      if (entry.speaker === 'pilot' && !entry.replayed) {
        void voice.play(entry.audioUrl, entry.transcript, faults.value?.radioNoise ?? 0.3);
      }
    }
    spoken = length;
  },
);

onMounted(unlockAudioOnGesture);

function toggleSelect(callsign: string): void {
  traffic.select(selectedCallsign.value === callsign ? null : callsign);
}
</script>

<template>
  <div class="controller">
    <TopBar :connected="connected">
      <template #start>
        <slot name="back" />
      </template>
    </TopBar>

    <div class="main">
      <section class="radar" aria-label="Radar">
        <RadarScope v-if="sector" :key="sector.id" />
        <div v-else-if="unassigned" class="joining" role="status">
          <span class="mono">NO SECTOR ASSIGNED</span>
          <span class="joining-sub"
            >Ask a supervisor to assign you a sector; this screen opens it at once.</span
          >
        </div>
        <div v-else class="joining" role="status">
          <span class="mono">CONNECTING TO SECTOR…</span>
        </div>
        <div class="top-left">
          <WeatherPanel />
          <p class="mono legend">
            LC = TIME SINCE LAST CONTACT · AMBER ≥ {{ limitText(limits.cautionS) }} · RED ≥
            {{ limitText(limits.warningS) }}<br />
            RINGS 10 NM · COMPASS ON 40 NM · MIDDLE-DRAG PAN · WHEEL ZOOM · SIMULATED TRAFFIC
          </p>
        </div>
        <div class="top-right">
          <UnackedBadge />
          <AircraftCard
            v-if="selectedCallsign"
            :callsign="selectedCallsign"
            @close="traffic.select(null)"
          />
        </div>
        <PttBar v-if="!readonly" class="ptt" />
      </section>

      <aside class="aside">
        <CommsPanel class="comms" />
        <AlertStack class="alerts" />
      </aside>
    </div>

    <section class="strips" aria-label="Flight strips">
      <FlightStrip
        v-for="a in aircraft"
        :key="a.callsign"
        :aircraft="a"
        :selected="a.callsign === selectedCallsign"
        :alert-level="levelByCallsign.get(a.callsign)"
        :limits="limits"
        @select="toggleSelect"
      />
    </section>

    <aside
      v-if="drawerOpen && !readonly"
      class="drawer"
      aria-label="Demo control (press D to close)"
    >
      <DemoPanel />
    </aside>

    <AlertModal />

    <StatsOverlay v-if="overlayVisible" @close="closeOverlay" />
  </div>
</template>

<style scoped>
.controller {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--aside-width);
}

.radar {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border-right: var(--border-width) solid var(--color-border);
}

.joining {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-size: 14px;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
  background: var(--color-radar-bg);
}

.joining-sub {
  font-size: 15px;
  letter-spacing: 0;
  color: var(--color-text-secondary);
}

.top-left {
  pointer-events: none; /* its empty corner must not block the map-mode buttons */
  position: absolute;
  top: var(--space-4);
  left: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.top-left > :not(.legend) {
  pointer-events: auto;
}

.legend {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--radar-label);
}

.top-right {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  bottom: 200px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
  pointer-events: none;
}

.top-right > * {
  pointer-events: auto;
}

.ptt {
  position: absolute;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
}

.aside {
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
  flex: 0 0 var(--alerts-height);
  min-height: 0;
}

.strips {
  flex: 0 0 var(--strips-height);
  padding: 14px var(--space-4);
  display: flex;
  gap: var(--space-3);
  background: var(--color-strips-bg);
  border-top: var(--border-width) solid var(--color-border);
}

.drawer {
  position: fixed;
  top: var(--topbar-height);
  right: 0;
  bottom: 0;
  z-index: 10;
  width: 420px;
  overflow-y: auto;
  border-left: var(--border-width) solid var(--color-border-strong);
  box-shadow: -16px 0 32px rgba(0, 0, 0, 0.45);
}
</style>
