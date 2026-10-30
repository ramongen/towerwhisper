import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Aircraft, FaultConfig, Targets } from '@towerwhisper/shared';
import type { ScenarioAircraft } from '../session/scenario-loader';
import { AircraftKinematics, type SimAircraft } from './aircraft-kinematics';
import { LANDED_NM, TICK_MS } from './constants';

export type TickListener = (aircraft: Aircraft[], simNowMs: number) => void;

/**
 * The 250 ms tick loop: updates position, heading, altitude and speed of every aircraft.
 *
 * Simulation time runs at the demo-panel time scale (pause, 1x, 2x, 4x). It starts at the
 * wall clock when the scenario loads, so `lastContactAt` looks like a real timestamp.
 */
@Injectable()
export class SimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationService.name);
  private aircraft = new Map<string, SimAircraft>();
  private listeners: TickListener[] = [];
  private timer?: NodeJS.Timeout;
  private simNow = Date.now();
  private timeScale: FaultConfig['timeScale'] = 1;

  constructor(private readonly kinematics: AircraftKinematics) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Replaces all traffic with the scenario's initial state; every comms timer starts at 0. */
  load(initial: ScenarioAircraft[]): void {
    this.simNow = Date.now();
    this.aircraft = new Map(initial.map((a) => [a.callsign, this.fromScenario(a)]));
    this.logger.log(`Loaded ${initial.length} aircraft`);
  }

  /** Adds one aircraft (demo "spawn conflict"). */
  spawn(initial: ScenarioAircraft): void {
    this.aircraft.set(initial.callsign, this.fromScenario(initial));
  }

  onTick(listener: TickListener): void {
    this.listeners.push(listener);
  }

  setTimeScale(scale: FaultConfig['timeScale']): void {
    this.timeScale = scale;
  }

  simNowMs(): number {
    return this.simNow;
  }

  getAircraft(): Aircraft[] {
    return [...this.aircraft.values()].map((a) => this.toPublic(a));
  }

  get(callsign: string): Aircraft | undefined {
    const a = this.aircraft.get(callsign);
    return a ? this.toPublic(a) : undefined;
  }

  /** Merges new targets (only the fields given) and records which clearance they come from. */
  setTargets(callsign: string, targets: Targets, clearanceId?: string): void {
    const a = this.aircraft.get(callsign);
    if (!a) return;
    a.target = { ...a.target, ...targets };
    if (targets.approach) a.locCaptured = false;
    if (clearanceId) a.activeClearanceId = clearanceId;
  }

  /** Any transmission to or from the aircraft resets its comms timer. */
  touchContact(callsign: string): void {
    const a = this.aircraft.get(callsign);
    if (!a) return;
    a.lastContactAt = new Date(this.simNow).toISOString();
    a.commsAgeS = 0;
  }

  /** Demo panel: pretend the last contact was `ageS` seconds ago. */
  setCommsAge(callsign: string, ageS: number): void {
    const a = this.aircraft.get(callsign);
    if (!a) return;
    a.lastContactAt = new Date(this.simNow - ageS * 1000).toISOString();
    a.commsAgeS = ageS;
  }

  private tick(): void {
    const dtS = (TICK_MS / 1000) * this.timeScale;
    this.simNow += dtS * 1000;

    for (const a of this.aircraft.values()) {
      this.kinematics.step(a, dtS);
      a.commsAgeS = Math.max(0, Math.floor((this.simNow - Date.parse(a.lastContactAt)) / 1000));
      const toThreshold = this.kinematics.distanceToThreshold(a);
      if (a.locCaptured && toThreshold !== null && toThreshold < LANDED_NM) {
        this.logger.log(`${a.callsign} landed runway ${a.target.approach?.runway}`);
        this.aircraft.delete(a.callsign);
      }
    }

    const snapshot = this.getAircraft();
    for (const listener of this.listeners) {
      try {
        listener(snapshot, this.simNow);
      } catch (error) {
        this.logger.error(`Tick listener failed: ${(error as Error).stack}`);
      }
    }
  }

  private fromScenario(a: ScenarioAircraft): SimAircraft {
    return {
      ...a,
      target: { ...a.target },
      lastContactAt: new Date(this.simNow).toISOString(),
      commsAgeS: 0,
    };
  }

  /** Rounded copy for the wire; simulator-only fields stay here. */
  private toPublic(a: SimAircraft): Aircraft {
    return {
      callsign: a.callsign,
      telephony: a.telephony,
      type: a.type,
      lat: a.lat,
      lon: a.lon,
      altitudeFt: Math.round(a.altitudeFt),
      headingDeg: Math.round(a.headingDeg) % 360,
      speedKt: Math.round(a.speedKt),
      verticalSpeedFpm: Math.round(a.verticalSpeedFpm),
      turnRateDegS: Math.round(a.turnRateDegS * 100) / 100,
      target: { ...a.target },
      activeClearanceId: a.activeClearanceId,
      lastContactAt: a.lastContactAt,
      commsAgeS: a.commsAgeS,
    };
  }
}
