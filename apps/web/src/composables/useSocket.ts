import {
  ClientEvent,
  SOCKET_NAMESPACE,
  ServerEvent,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketAuth,
} from '@towerwhisper/shared';
import { io, type Socket } from 'socket.io-client';
import { readonly, ref } from 'vue';
import { useAlertStore } from '../stores/useAlertStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useCommsStore } from '../stores/useCommsStore';
import { useDemoStore } from '../stores/useDemoStore';
import { useSectorStore } from '../stores/useSectorStore';
import { useSupervisorStore } from '../stores/useSupervisorStore';
import { setProbe, useTrafficStore } from '../stores/useTrafficStore';
import { useWeatherStore } from '../stores/useWeatherStore';
import { setApiSector } from '../utils/api';

type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: LiveSocket | null = null;
let socketToken: string | null | undefined;
/** The sector a supervisor or the demo panel follows; sent again after every reconnect. */
let watched: string | null = null;
const connected = ref(false);

/** Clears what belongs to the previous sector, so two sectors never mix on screen. */
function clearSectorState(): void {
  useCommsStore().clear();
  useAlertStore().clearAll();
  useTrafficStore().reset();
  useWeatherStore().clear();
}

/**
 * The single Socket.IO connection to /live, opened with the user's token (or none for the
 * demo panel). It follows one sector at a time: an ATC its own, a supervisor or the demo
 * panel the one passed to watchSector(). Every server event fills the Pinia stores.
 */
export function connectSocket(token: string | null): void {
  if (socket && socketToken === token) return;
  socket?.disconnect();
  socketToken = token;
  const auth: SocketAuth = token ? { token } : {};
  socket = io(SOCKET_NAMESPACE, { auth }); // relative URL: works behind Vite proxy and nginx

  const traffic = useTrafficStore();
  const comms = useCommsStore();
  const alerts = useAlertStore();
  const demo = useDemoStore();
  const weather = useWeatherStore();
  const sector = useSectorStore();
  const supervisor = useSupervisorStore();

  socket.on('connect', () => {
    connected.value = true;
    if (watched) socket?.emit(ClientEvent.SectorWatch, watched);
    // The server forgets the selection on restart; tell it again.
    socket?.emit(ClientEvent.RadarSelect, traffic.selectedCallsign);
  });
  socket.on('disconnect', () => (connected.value = false));

  socket.on(ServerEvent.SectorJoined, (payload) => {
    if (sector.current?.id !== payload.sector.id) clearSectorState();
    sector.joined(payload);
    // A supervisor moved this controller to another sector: the account changed too.
    const auth = useAuthStore();
    if (payload.access === 'control' && auth.user?.sectorId !== payload.sector.id)
      void auth.refresh();
    demo.setSession(payload.sessionId, payload.startedAt);
    void demo.loadSession().catch(() => undefined);
  });
  socket.on(ServerEvent.TrafficUpdate, traffic.setAircraft);
  socket.on(ServerEvent.ProbeResult, setProbe);
  socket.on(ServerEvent.CommsTransmission, (entry) => comms.add(entry));
  socket.on(ServerEvent.CommsReadback, (entry) => comms.add(entry));
  socket.on(ServerEvent.CommsHistory, comms.addHistory);
  socket.on(ServerEvent.AlertRaised, alerts.raise);
  socket.on(ServerEvent.AlertCleared, alerts.clear);
  socket.on(ServerEvent.AlertHistory, alerts.setHistory);
  socket.on(ServerEvent.DemoFaults, demo.setFaults);
  socket.on(ServerEvent.FrequencyBusy, ({ busy }) => comms.setFrequencyBusy(busy));
  socket.on(ServerEvent.WeatherUpdate, weather.set);
  socket.on(ServerEvent.StatsOverlay, ({ visible }) => demo.setOverlay(visible));
  socket.on(ServerEvent.SupervisorOverview, supervisor.setOverview);
  socket.on(ServerEvent.SessionReset, ({ sessionId, startedAt }) => {
    comms.clear();
    alerts.clearAll();
    traffic.reset();
    demo.setSession(sessionId, startedAt);
  });
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  socketToken = undefined;
  watched = null;
  connected.value = false;
  clearSectorState();
  useSectorStore().leave();
}

/** Supervisor and demo panel: follow this sector read-only (null: stop following). */
export function watchSector(sectorId: string | null): void {
  if (watched === sectorId) return;
  watched = sectorId;
  setApiSector(sectorId);
  if (!sectorId) {
    clearSectorState();
    useSectorStore().leave();
  }
  socket?.emit(ClientEvent.SectorWatch, sectorId);
}

export function useSocket() {
  function emitPtt(on: boolean): void {
    socket?.emit(on ? ClientEvent.PttStart : ClientEvent.PttEnd);
  }

  function emitSelect(callsign: string | null): void {
    socket?.emit(ClientEvent.RadarSelect, callsign);
  }

  return { connected: readonly(connected), emitPtt, emitSelect };
}
