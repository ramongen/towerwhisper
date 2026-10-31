import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type {
  Aircraft,
  FaultConfig,
  FlightPlan,
  RunwayId,
  Targets,
  Waypoint,
} from '@towerwhisper/shared';
import { runway } from '../airspace/airspace';
import type { ScenarioAircraft } from '../session/scenario-loader';
import { AircraftKinematics, finalApproachPosition, type SimAircraft } from './aircraft-kinematics';
import {
  GO_AROUND_ALTITUDE_FT,
  GO_AROUND_NM,
  GO_AROUND_SPEED_KT,
  LANDED_NM,
  LANDING_REQUEST_NM,
  TICK_MS,
} from './constants';

export type TickListener = (aircraft: Aircraft[], simNowMs: number) => void;

export type GoAroundReason = 'no landing clearance' | 'instructed';

/** What an aircraft does by itself that the pilot says on the frequency, or that ends a flight. */
export type SimEvent =
  | { type: 'landing-request'; callsign: string; runway: RunwayId; distanceNm: number }
  | { type: 'go-around'; callsign: string; runway: RunwayId; reason: GoAroundReason }
  | { type: 'landed'; callsign: string; runway: RunwayId };

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
  private flightPlans = new Map<string, FlightPlan>();
  private fixes = new Map<string, Waypoint>();
  private listeners: TickListener[] = [];
  private readonly eventListeners: ((event: SimEvent) => void)[] = [];
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
  load(initial: ScenarioAircraft[], fixes: Waypoint[] = []): void {
    this.simNow = Date.now();
    this.fixes = new Map(fixes.map((f) => [f.name, f]));
    this.flightPlans = new Map();
    this.aircraft = new Map(initial.map((a) => [a.callsign, this.fromScenario(a)]));
    this.logger.log(`Loaded ${initial.length} aircraft`);
  }

  /** Adds one aircraft (demo "spawn conflict"). */
  spawn(initial: ScenarioAircraft): void {
    this.aircraft.set(initial.callsign, this.fromScenario(initial));
  }

  onEvent(listener: (event: SimEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Missed approach: runway heading, climb to the go-around altitude, approach and landing
   * clearance cancelled. The aircraft then waits for vectors.
   */
  goAround(callsign: string, reason: GoAroundReason): void {
    const a = this.aircraft.get(callsign);
    const rwy = a?.target.approach?.runway;
    if (!a || !rwy) return;
    a.target = {
      ...a.target,
      approach: undefined,
      landingCleared: false,
      headingDeg: Math.round(runway(rwy).trueBearingDeg) % 360,
      turnDir: 'any',
      altitudeFt: Math.max(GO_AROUND_ALTITUDE_FT, Math.round(a.altitudeFt / 100) * 100),
      speedKt: GO_AROUND_SPEED_KT,
    };
    a.locCaptured = false;
    a.landingRequested = false;
    this.logger.log(`${callsign} going around runway ${rwy} (${reason})`);
    this.emit({ type: 'go-around', callsign, runway: rwy, reason });
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

  /** The filed flight plan (route as filed, not what is left of it). */
  getFlightPlan(callsign: string): FlightPlan | undefined {
    return this.flightPlans.get(callsign);
  }

  /** Fixes still ahead on own navigation; empty while the aircraft flies a vector. */
  getRemainingRoute(callsign: string): Waypoint[] {
    const a = this.aircraft.get(callsign);
    if (!a || a.target.headingDeg !== undefined) return [];
    return a.route.slice(a.routeIndex);
  }

  getFixes(): Waypoint[] {
    return [...this.fixes.values()];
  }

  /**
   * Applies a clearance: only the fields given change. A heading or a direct-to takes the
   * aircraft off its approach (it now flies the vector); a heading also ends own navigation.
   */
  setTargets(callsign: string, targets: Targets, clearanceId?: string): void {
    const a = this.aircraft.get(callsign);
    if (!a) return;
    const lateral = 'headingDeg' in targets || 'directTo' in targets;
    if (lateral && !targets.approach) {
      a.target.approach = undefined;
      a.target.landingCleared = false;
      a.locCaptured = false;
      a.landingRequested = false;
    }
    if (targets.altitudeFt !== undefined && a.locCaptured && targets.altitudeFt > a.altitudeFt) {
      a.target.approach = undefined; // climbing off the glide slope: approach discontinued
      a.locCaptured = false;
    }
    a.target = { ...a.target, ...targets };
    if (targets.approach) a.locCaptured = false;
    if (targets.directTo) this.directTo(a, targets.directTo);
    if (clearanceId) a.activeClearanceId = clearanceId;
  }

  /** Own navigation from a fix: the rest of the route if the fix is on it, else that fix alone. */
  private directTo(a: SimAircraft, fixName: string): void {
    const onRoute = a.route.findIndex((w) => w.name === fixName);
    const fix = this.fixes.get(fixName);
    if (onRoute >= 0) {
      a.routeIndex = onRoute;
    } else if (fix) {
      a.route = [fix];
      a.routeIndex = 0;
    }
    a.target.headingDeg = undefined;
    a.target.turnDir = undefined;
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
      this.landingPhase(a);
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

  /** On the final approach: ask for landing clearance, go around without it, or land. */
  private landingPhase(a: SimAircraft): void {
    const rwy = a.target.approach?.runway;
    if (!rwy || !a.locCaptured) return;
    const { alongTrack } = finalApproachPosition(a, rwy);
    if (a.target.landingCleared) {
      if (alongTrack < LANDED_NM) {
        this.logger.log(`${a.callsign} landed runway ${rwy}`);
        this.aircraft.delete(a.callsign);
        this.emit({ type: 'landed', callsign: a.callsign, runway: rwy });
      }
      return;
    }
    if (!a.landingRequested && alongTrack < LANDING_REQUEST_NM) {
      a.landingRequested = true;
      this.emit({
        type: 'landing-request',
        callsign: a.callsign,
        runway: rwy,
        distanceNm: Math.round(alongTrack),
      });
    }
    if (alongTrack < GO_AROUND_NM) this.goAround(a.callsign, 'no landing clearance');
  }

  private emit(event: SimEvent): void {
    for (const l of this.eventListeners) {
      try {
        l(event);
      } catch (error) {
        this.logger.error(`Event listener failed: ${(error as Error).stack}`);
      }
    }
  }

  private fromScenario({ flightPlan, routeIndex, ...a }: ScenarioAircraft): SimAircraft {
    if (flightPlan) this.flightPlans.set(a.callsign, flightPlan);
    return {
      ...a,
      target: { ...a.target },
      route: flightPlan?.route ?? [],
      routeIndex: Math.max(0, routeIndex ?? 0),
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
      nextWaypoint: a.nextWaypoint,
      holding: a.holding,
    };
  }
}
