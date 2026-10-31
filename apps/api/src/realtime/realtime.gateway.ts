import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  ClientEvent,
  ServerEvent,
  type ClientToServerEvents,
  type PresenceUser,
  type ServerToClientEvents,
  type SocketAuth,
  type SupervisorOverviewPayload,
} from '@towerwhisper/shared';
import type { Namespace, Socket } from 'socket.io';
import { AuthService, type AuthUser } from '../auth/auth.service';
import { OVERVIEW_DEBOUNCE_MS, OVERVIEW_INTERVAL_MS } from '../sectors/constants';
import { SectorRegistry } from '../sectors/sector-registry';
import type { SectorEmitter } from '../sectors/sector-runtime';
import { isSectorId } from '../sectors/sectors';
import { REALTIME_NAMESPACE } from './constants';

interface SocketData {
  /** Resolves once the handshake token has been checked. */
  ready: Promise<void>;
  user: AuthUser | null;
  sectorId: string | null;
  access: 'control' | 'view';
}

type LiveSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const SUPERVISORS = 'supervisors';
const sectorRoom = (id: string) => `sector:${id}`;

/**
 * Socket.IO gateway on /live. Every sector has a room: an ATC joins its own sector on
 * connect (and controls it); a supervisor or the demo panel follow one with sector:watch
 * (read-only). Supervisors also get the live overview of every sector.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private overviewTimer?: NodeJS.Timeout;
  private overviewPending?: NodeJS.Timeout;

  @WebSocketServer()
  server: Namespace<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

  constructor(
    private readonly sectors: SectorRegistry,
    private readonly auth: AuthService,
  ) {}

  afterInit(): void {
    for (const runtime of this.sectors.all()) {
      const room = sectorRoom(runtime.id);
      const emit: SectorEmitter = (event, ...args) => this.server.to(room).emit(event, ...args);
      runtime.setEmitter(emit);
      runtime.onAlertsChanged(() => this.scheduleOverview());
    }
    this.overviewTimer = setInterval(() => this.pushOverview(), OVERVIEW_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.overviewTimer);
    clearTimeout(this.overviewPending);
  }

  handleConnection(client: LiveSocket): void {
    client.data.user = null;
    client.data.sectorId = null;
    client.data.access = 'view';
    client.data.ready = this.identify(client);
  }

  handleDisconnect(client: LiveSocket): void {
    const { sectorId } = client.data;
    if (sectorId) this.sectors.get(sectorId).setPtt(client.id, false);
    this.scheduleOverview();
  }

  @SubscribeMessage(ClientEvent.SectorWatch)
  async watch(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() sectorId: unknown,
  ): Promise<void> {
    await client.data.ready;
    if (client.data.user?.role === 'atc') return; // an ATC always follows its own sector
    this.leaveSector(client);
    if (isSectorId(sectorId)) this.joinSector(client, sectorId, 'view');
  }

  @SubscribeMessage(ClientEvent.PttStart)
  async pttStart(@ConnectedSocket() client: LiveSocket): Promise<void> {
    await client.data.ready;
    const { sectorId, access } = client.data;
    if (sectorId && access === 'control') this.sectors.get(sectorId).setPtt(client.id, true);
  }

  @SubscribeMessage(ClientEvent.PttEnd)
  async pttEnd(@ConnectedSocket() client: LiveSocket): Promise<void> {
    await client.data.ready;
    const { sectorId } = client.data;
    if (sectorId) this.sectors.get(sectorId).setPtt(client.id, false);
  }

  @SubscribeMessage(ClientEvent.RadarSelect)
  async radarSelect(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() callsign: string | null,
  ): Promise<void> {
    await client.data.ready;
    const { sectorId, access } = client.data;
    // Only the controller's selection steers demo faults with target "selected".
    if (!sectorId || access !== 'control') return;
    this.sectors
      .get(sectorId)
      .faults.setSelectedCallsign(typeof callsign === 'string' ? callsign : null);
  }

  /** Who is in each sector now: controllers by name, and a count of the others. */
  presence(sectorId: string): {
    controllers: PresenceUser[];
    viewers: PresenceUser[];
    anonymous: number;
  } {
    const controllers = new Map<string, PresenceUser>();
    const viewers = new Map<string, PresenceUser>();
    let anonymous = 0;
    for (const socket of this.server?.sockets.values() ?? []) {
      if (socket.data.sectorId !== sectorId) continue;
      const user = socket.data.user;
      if (!user) anonymous++;
      else if (socket.data.access === 'control') controllers.set(user.id, presenceOf(user));
      else viewers.set(user.id, presenceOf(user));
    }
    return { controllers: [...controllers.values()], viewers: [...viewers.values()], anonymous };
  }

  /**
   * A supervisor changed (or deleted) an account: its open screens follow at once, e.g. an
   * ATC moved to another sector switches its radar there.
   */
  refreshUser(id: string, user: AuthUser | null): void {
    for (const socket of this.server?.sockets.values() ?? []) {
      if (socket.data.user?.id !== id) continue;
      if (!user) {
        socket.disconnect(true);
        continue;
      }
      socket.data.user = user;
      if (user.role === 'atc') {
        if (socket.data.sectorId !== user.sectorId || socket.data.access !== 'control') {
          this.leaveSector(socket);
          void socket.leave(SUPERVISORS);
          if (user.sectorId && isSectorId(user.sectorId))
            this.joinSector(socket, user.sectorId, 'control');
        }
      } else {
        if (socket.data.access === 'control') this.leaveSector(socket);
        void socket.join(SUPERVISORS);
      }
    }
    this.scheduleOverview();
  }

  /** Ids of the accounts with a screen open. */
  onlineUserIds(): Set<string> {
    const ids = new Set<string>();
    for (const socket of this.server?.sockets.values() ?? []) {
      if (socket.data.user) ids.add(socket.data.user.id);
    }
    return ids;
  }

  overview(): SupervisorOverviewPayload {
    return {
      at: new Date().toISOString(),
      sectors: this.sectors.all().map((runtime) => {
        const { controllers, viewers, anonymous } = this.presence(runtime.id);
        return runtime.overview(controllers, viewers.length + anonymous);
      }),
    };
  }

  private async identify(client: LiveSocket): Promise<void> {
    const { token } = (client.handshake.auth ?? {}) as SocketAuth;
    const user = await this.auth.authenticate(token);
    client.data.user = user;
    if (user?.role === 'atc' && user.sectorId && isSectorId(user.sectorId)) {
      this.joinSector(client, user.sectorId, 'control');
    } else if (user?.role === 'supervisor') {
      void client.join(SUPERVISORS);
      client.emit(ServerEvent.SupervisorOverview, this.overview());
    }
  }

  private joinSector(client: LiveSocket, sectorId: string, access: 'control' | 'view'): void {
    const runtime = this.sectors.get(sectorId);
    client.data.sectorId = sectorId;
    client.data.access = access;
    void client.join(sectorRoom(sectorId));
    runtime.sendInitialState((event, ...args) => client.emit(event, ...args), access);
    this.scheduleOverview();
  }

  private leaveSector(client: LiveSocket): void {
    const { sectorId } = client.data;
    if (!sectorId) return;
    this.sectors.get(sectorId).setPtt(client.id, false);
    void client.leave(sectorRoom(sectorId));
    client.data.sectorId = null;
    this.scheduleOverview();
  }

  /** Several changes in a burst (a reset, a conflict pair) make one push. */
  private scheduleOverview(): void {
    if (this.overviewPending) return;
    this.overviewPending = setTimeout(() => {
      this.overviewPending = undefined;
      this.pushOverview();
    }, OVERVIEW_DEBOUNCE_MS);
  }

  private pushOverview(): void {
    if (!this.server) return;
    try {
      this.server.to(SUPERVISORS).emit(ServerEvent.SupervisorOverview, this.overview());
    } catch (error) {
      this.logger.error(`Overview failed: ${(error as Error).message}`);
    }
  }
}

function presenceOf(user: AuthUser): PresenceUser {
  return { id: user.id, name: user.name, role: user.role };
}
