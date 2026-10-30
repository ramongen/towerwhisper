import { Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  ClientEvent,
  ServerEvent,
  type ClientToServerEvents,
  type CommsReadbackPayload,
  type CommsTransmissionPayload,
  type ProbeResultPayload,
  type ServerToClientEvents,
  type SessionResetPayload,
} from '@towerwhisper/shared';
import type { Namespace, Socket } from 'socket.io';
import { FaultService } from '../demo/fault.service';
import { AlertRegistry } from '../safety/alert-registry';
import { SimulationService } from '../simulation/simulation.service';
import { COMMS_HISTORY_SIZE, REALTIME_NAMESPACE } from './constants';

export type CommsEvent =
  | { kind: 'transmission'; payload: CommsTransmissionPayload }
  | { kind: 'readback'; payload: CommsReadbackPayload };

type LiveSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Socket.IO gateway on /live: pushes state to every connected screen. A screen that
 * connects late (or reloads) gets the current faults, active alerts and recent comms.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway implements OnModuleInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private history: CommsEvent[] = [];
  private readonly pttHolders = new Set<string>();
  private readonly commsListeners: ((event: CommsEvent) => void)[] = [];

  @WebSocketServer()
  server: Namespace<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly simulation: SimulationService,
    private readonly alerts: AlertRegistry,
    private readonly faults: FaultService,
  ) {}

  onModuleInit(): void {
    this.simulation.onTick((aircraft) => this.server?.emit(ServerEvent.TrafficUpdate, aircraft));
    this.alerts.subscribe({
      raised: (alert) => this.server?.emit(ServerEvent.AlertRaised, alert),
      cleared: (alert, reason) =>
        this.server?.emit(ServerEvent.AlertCleared, { id: alert.id, reason }),
    });
    this.faults.onChange((config) => this.server?.emit(ServerEvent.DemoFaults, config));
    this.faults.onOverlay((visible) => this.server?.emit(ServerEvent.StatsOverlay, { visible }));
  }

  handleConnection(client: LiveSocket): void {
    client.emit(ServerEvent.DemoFaults, this.faults.getConfig());
    client.emit(ServerEvent.FrequencyBusy, { busy: this.pttHolders.size > 0 });
    client.emit(ServerEvent.StatsOverlay, { visible: this.faults.isOverlayVisible() });
    for (const event of this.history) {
      if (event.kind === 'transmission') client.emit(ServerEvent.CommsTransmission, event.payload);
      else client.emit(ServerEvent.CommsReadback, event.payload);
    }
    for (const alert of this.alerts.list()) client.emit(ServerEvent.AlertRaised, alert);
  }

  handleDisconnect(client: LiveSocket): void {
    if (this.pttHolders.delete(client.id)) this.emitBusy();
  }

  @SubscribeMessage(ClientEvent.PttStart)
  pttStart(@ConnectedSocket() client: LiveSocket): void {
    this.pttHolders.add(client.id);
    this.emitBusy();
  }

  @SubscribeMessage(ClientEvent.PttEnd)
  pttEnd(@ConnectedSocket() client: LiveSocket): void {
    this.pttHolders.delete(client.id);
    this.emitBusy();
  }

  @SubscribeMessage(ClientEvent.RadarSelect)
  radarSelect(@MessageBody() callsign: string | null): void {
    this.faults.setSelectedCallsign(typeof callsign === 'string' ? callsign : null);
  }

  /** Internal subscribers (persistence) for every transmission and readback. */
  onComms(listener: (event: CommsEvent) => void): void {
    this.commsListeners.push(listener);
  }

  broadcastTransmission(payload: CommsTransmissionPayload): void {
    this.remember({ kind: 'transmission', payload });
    this.server?.emit(ServerEvent.CommsTransmission, payload);
    if (payload.clearance) this.server?.emit(ServerEvent.ClearanceIssued, payload.clearance);
  }

  broadcastReadback(payload: CommsReadbackPayload): void {
    this.remember({ kind: 'readback', payload });
    this.server?.emit(ServerEvent.CommsReadback, payload);
  }

  broadcastProbe(payload: ProbeResultPayload): void {
    this.server?.emit(ServerEvent.ProbeResult, payload);
  }

  sessionReset(payload: SessionResetPayload): void {
    this.history = [];
    this.pttHolders.clear();
    this.server?.emit(ServerEvent.SessionReset, payload);
    this.logger.log(`Session ${payload.sessionId} started`);
  }

  private remember(event: CommsEvent): void {
    this.history = [...this.history, event].slice(-COMMS_HISTORY_SIZE);
    for (const l of this.commsListeners) {
      try {
        l(event);
      } catch (error) {
        this.logger.error(`Comms listener failed: ${(error as Error).message}`);
      }
    }
  }

  private emitBusy(): void {
    this.server?.emit(ServerEvent.FrequencyBusy, { busy: this.pttHolders.size > 0 });
  }
}
