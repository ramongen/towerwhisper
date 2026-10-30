<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onMounted, watch } from 'vue';
import AircraftCard from '../components/AircraftCard.vue';
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
import { useDemoStore } from '../stores/useDemoStore';
import { useTrafficStore } from '../stores/useTrafficStore';

const { connected, emitSelect } = useSocket();
const traffic = useTrafficStore();
const { aircraft, selectedCallsign } = storeToRefs(traffic);
const { levelByCallsign } = storeToRefs(useAlertStore());
const demo = useDemoStore();
const { faults, overlayVisible } = storeToRefs(demo);
const { drawerOpen } = useDemoShortcuts();

function closeOverlay(): void {
  void demo.trigger('stats-overlay', { visible: false }).catch(() => undefined);
}

const limits = computed(() => faults.value?.commsLimits ?? { cautionS: 900, warningS: 1800 });

/** '15 MIN' or '15 S' for the radar legend. */
const limitText = (s: number) =>
  limits.value.cautionS < 120 ? `${s} S` : `${Math.round(s / 60)} MIN`;

/** Only readbacks that arrive live are spoken (not the history replayed on reconnect). */
const LIVE_READBACK_MS = 3000;

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
      if (entry.speaker === 'pilot' && Date.now() - entry.receivedAt < LIVE_READBACK_MS) {
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
    <TopBar :connected="connected" />

    <div class="main">
      <section class="radar" aria-label="Radar">
        <RadarScope />
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
        <PttBar class="ptt" />
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

    <aside v-if="drawerOpen" class="drawer" aria-label="Demo control (press D to close)">
      <DemoPanel />
    </aside>

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

.top-left {
  position: absolute;
  top: var(--space-4);
  left: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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
