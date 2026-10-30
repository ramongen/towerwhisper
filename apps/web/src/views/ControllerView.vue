<script setup lang="ts">
import { storeToRefs } from 'pinia';
import AlertStack from '../components/AlertStack.vue';
import CommsPanel from '../components/CommsPanel.vue';
import FlightStrip from '../components/FlightStrip.vue';
import PttBar from '../components/PttBar.vue';
import RadarScope from '../components/RadarScope.vue';
import { useSocket } from '../composables/useSocket';
import { useTrafficStore } from '../stores/useTrafficStore';

const { connected } = useSocket();
const { aircraft, lastUpdateAt } = storeToRefs(useTrafficStore());

function formatAge(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
</script>

<template>
  <div class="controller">
    <header class="topbar panel">
      <strong>CRAIOVA APPROACH</strong>
      <span class="mono" :class="connected ? 'ok' : 'down'">
        {{ connected ? '● CONNECTED' : '○ DISCONNECTED' }}
      </span>
    </header>

    <section class="radar panel">
      <span class="panel-label">Radar</span>
      <RadarScope />

      <!-- SKELETON: temporary list proving traffic:update arrives over the socket. -->
      <table class="mono aircraft-list">
        <thead>
          <tr>
            <th>CALLSIGN</th>
            <th>TYPE</th>
            <th>ALT</th>
            <th>HDG</th>
            <th>SPD</th>
            <th>LC</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in aircraft" :key="a.callsign">
            <td>{{ a.callsign }}</td>
            <td>{{ a.type }}</td>
            <td>{{ a.altitudeFt }}</td>
            <td>{{ String(a.headingDeg).padStart(3, '0') }}</td>
            <td>{{ a.speedKt }}</td>
            <td>{{ formatAge(a.commsAgeS) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="mono update-info">
        {{ aircraft.length }} aircraft · last update
        {{ lastUpdateAt ? new Date(lastUpdateAt).toISOString().slice(11, 23) : '—' }}
      </p>

      <div class="ptt">
        <PttBar />
      </div>
    </section>

    <section class="comms panel">
      <span class="panel-label">Communications</span>
      <CommsPanel />
    </section>

    <section class="alerts panel">
      <span class="panel-label">Alerts</span>
      <AlertStack />
    </section>

    <section class="strips panel">
      <span class="panel-label">Flight strips</span>
      <FlightStrip />
    </section>
  </div>
</template>

<style scoped>
.controller {
  display: grid;
  grid-template-columns: var(--radar-width) 1fr;
  grid-template-rows: var(--topbar-height) 1fr 1fr var(--strips-height);
  grid-template-areas:
    'topbar topbar'
    'radar comms'
    'radar alerts'
    'strips strips';
  gap: var(--space-2);
  height: 100vh;
  padding: var(--space-2);
}

.topbar {
  grid-area: topbar;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  letter-spacing: 0.06em;
}

.radar {
  grid-area: radar;
  position: relative;
}

.comms {
  grid-area: comms;
}

.alerts {
  grid-area: alerts;
}

.strips {
  grid-area: strips;
}

.ok {
  color: var(--color-ok);
}

.down {
  color: var(--color-warning);
}

.aircraft-list {
  margin: var(--space-3);
  border-collapse: collapse;
}

.aircraft-list th,
.aircraft-list td {
  padding: var(--space-1) var(--space-4) var(--space-1) 0;
  text-align: left;
}

.aircraft-list th {
  color: var(--color-text-muted);
  font-weight: 500;
}

.update-info {
  margin: 0 var(--space-3);
  color: var(--color-text-muted);
}

.ptt {
  position: absolute;
  bottom: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius);
}
</style>
