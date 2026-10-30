import {
  ClientEvent,
  SOCKET_NAMESPACE,
  ServerEvent,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@towerwhisper/shared';
import { io, type Socket } from 'socket.io-client';
import { readonly, ref } from 'vue';
import { useAlertStore } from '../stores/useAlertStore';
import { useCommsStore } from '../stores/useCommsStore';
import { useDemoStore } from '../stores/useDemoStore';
import { setProbe, useTrafficStore } from '../stores/useTrafficStore';

type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: LiveSocket | null = null;
const connected = ref(false);

/** The single Socket.IO connection to /live. Wires every server event into the Pinia stores. */
export function useSocket() {
  if (!socket) {
    socket = io(SOCKET_NAMESPACE); // relative URL: works behind Vite proxy and nginx

    const traffic = useTrafficStore();
    const comms = useCommsStore();
    const alerts = useAlertStore();
    const demo = useDemoStore();

    socket.on('connect', () => {
      connected.value = true;
      void demo.loadSession().catch(() => undefined);
      // The server forgets the selection on restart; tell it again.
      socket?.emit(ClientEvent.RadarSelect, traffic.selectedCallsign);
    });
    socket.on('disconnect', () => (connected.value = false));

    socket.on(ServerEvent.TrafficUpdate, traffic.setAircraft);
    socket.on(ServerEvent.ProbeResult, setProbe);
    socket.on(ServerEvent.CommsTransmission, comms.add);
    socket.on(ServerEvent.CommsReadback, comms.add);
    socket.on(ServerEvent.AlertRaised, alerts.raise);
    socket.on(ServerEvent.AlertCleared, ({ id }) => alerts.clear(id));
    socket.on(ServerEvent.DemoFaults, demo.setFaults);
    socket.on(ServerEvent.FrequencyBusy, ({ busy }) => comms.setFrequencyBusy(busy));
    socket.on(ServerEvent.StatsOverlay, ({ visible }) => demo.setOverlay(visible));
    socket.on(ServerEvent.SessionReset, ({ sessionId, startedAt }) => {
      comms.clear();
      alerts.clearAll();
      traffic.reset();
      demo.setSession(sessionId, startedAt);
    });
  }

  function emitPtt(on: boolean): void {
    socket?.emit(on ? ClientEvent.PttStart : ClientEvent.PttEnd);
  }

  function emitSelect(callsign: string | null): void {
    socket?.emit(ClientEvent.RadarSelect, callsign);
  }

  return { socket, connected: readonly(connected), emitPtt, emitSelect };
}
