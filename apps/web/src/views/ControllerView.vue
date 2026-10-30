<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, watch } from 'vue';
import AlertStack from '../components/AlertStack.vue';
import CommsPanel from '../components/CommsPanel.vue';
import FlightStrip from '../components/FlightStrip.vue';
import PttBar from '../components/PttBar.vue';
import RadarScope from '../components/RadarScope.vue';
import TopBar from '../components/TopBar.vue';
import { useSocket } from '../composables/useSocket';
import { useAlertStore } from '../stores/useAlertStore';
import { useDemoStore } from '../stores/useDemoStore';
import { useTrafficStore } from '../stores/useTrafficStore';

const { connected, emitSelect } = useSocket();
const traffic = useTrafficStore();
const { aircraft, selectedCallsign } = storeToRefs(traffic);
const { levelByCallsign } = storeToRefs(useAlertStore());
const { faults } = storeToRefs(useDemoStore());

const limits = computed(() => faults.value?.commsLimits ?? { cautionS: 900, warningS: 1800 });

// Demo faults with target "selected" follow the radar selection.
watch(selectedCallsign, (callsign) => emitSelect(callsign));

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
</style>
