import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import {
  ServerEvent,
  type Aircraft,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@towerwhisper/shared';
import type { Namespace } from 'socket.io';
import { DEFAULT_SCENARIO } from '../session/constants';
import { ScenarioLoader } from '../session/scenario-loader';
import { REALTIME_NAMESPACE, TRAFFIC_BROADCAST_MS } from './constants';

/**
 * Socket.IO gateway on /live: pushes state to every connected screen.
 *
 * SKELETON: until SimulationService exists, it broadcasts the scenario aircraft as static
 * mock traffic. Only commsAgeS changes, so the frontend can see the 4 Hz updates arriving.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private timer?: NodeJS.Timeout;

  @WebSocketServer()
  server: Namespace<ClientToServerEvents, ServerToClientEvents>;

  constructor(private readonly scenarios: ScenarioLoader) {}

  onModuleInit(): void {
    const startedAt = new Date();
    const aircraft: Aircraft[] = this.scenarios.load(DEFAULT_SCENARIO).aircraft.map((a) => ({
      ...a,
      lastContactAt: startedAt.toISOString(),
      commsAgeS: 0,
    }));
    this.logger.log(`Mock traffic: ${aircraft.length} aircraft every ${TRAFFIC_BROADCAST_MS} ms`);

    this.timer = setInterval(() => {
      const commsAgeS = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      this.server?.emit(
        ServerEvent.TrafficUpdate,
        aircraft.map((a) => ({ ...a, commsAgeS })),
      );
    }, TRAFFIC_BROADCAST_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }
}
