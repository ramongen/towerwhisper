import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AlertType, DemoTriggerResponse, FaultConfig } from '@towerwhisper/shared';
import { DEFAULT_COMMS_CAUTION_MIN, DEFAULT_COMMS_WARNING_MIN } from '../safety/constants';
import { toLatLon, toXy, velocity } from '../simulation/geo';
import { SimulationService } from '../simulation/simulation.service';
import {
  CONFLICT_INTRUDER,
  CONFLICT_SPAWN_DISTANCE_NM,
  CONFLICT_SPAWN_OFFSET_DEG,
  DEFAULT_RADIO_NOISE,
  EXPECTED_ALERTS,
  type FaultKind,
} from './constants';

export interface FaultInjection {
  kind: FaultKind;
  callsign: string;
  expected: AlertType[];
  config: Record<string, unknown>;
}

type ReadbackFault = NonNullable<FaultConfig['readback']>;
type ExecutionFault = NonNullable<FaultConfig['execution']>;

/**
 * Holds the demo-panel fault configuration and fires scenario triggers. Faults only change
 * what the simulated pilot says or flies; the safety checks never read this configuration
 * (except the NO_CONTACT limits, which are a setting, not a fault).
 */
@Injectable()
export class FaultService {
  private readonly logger = new Logger(FaultService.name);
  private config: FaultConfig;
  private selectedCallsign: string | null = null;
  private steppedOnArmed = false;
  private overlayVisible = false;
  private readonly changeListeners: ((config: FaultConfig) => void)[] = [];
  private readonly injectionListeners: ((injection: FaultInjection) => void)[] = [];
  private readonly overlayListeners: ((visible: boolean) => void)[] = [];

  constructor(
    env: ConfigService,
    private readonly simulation: SimulationService,
  ) {
    const cautionMin = Number(env.get('COMMS_CAUTION_MIN') ?? DEFAULT_COMMS_CAUTION_MIN);
    const warningMin = Number(env.get('COMMS_WARNING_MIN') ?? DEFAULT_COMMS_WARNING_MIN);
    this.config = {
      target: { mode: 'selected' },
      readback: null,
      execution: null,
      radioNoise: DEFAULT_RADIO_NOISE,
      timeScale: 1,
      commsLimits: { cautionS: cautionMin * 60, warningS: warningMin * 60 },
    };
  }

  onChange(listener: (config: FaultConfig) => void): void {
    this.changeListeners.push(listener);
  }

  onInjected(listener: (injection: FaultInjection) => void): void {
    this.injectionListeners.push(listener);
  }

  onOverlay(listener: (visible: boolean) => void): void {
    this.overlayListeners.push(listener);
  }

  getConfig(): FaultConfig {
    return this.config;
  }

  isOverlayVisible(): boolean {
    return this.overlayVisible;
  }

  setConfig(next: FaultConfig): FaultConfig {
    this.config = validate(next);
    this.simulation.setTimeScale(this.config.timeScale);
    this.emitChange();
    return this.config;
  }

  /** The aircraft selected on the controller's radar (sent over the socket). */
  setSelectedCallsign(callsign: string | null): void {
    this.selectedCallsign = callsign;
  }

  /** New scenario: disarm faults, normal speed. NO_CONTACT limits and the target stay. */
  resetForNewSession(): void {
    this.config = {
      ...this.config,
      readback: null,
      execution: null,
      radioNoise: DEFAULT_RADIO_NOISE,
      timeScale: 1,
    };
    this.steppedOnArmed = false;
    this.overlayVisible = false;
    this.simulation.setTimeScale(1);
    this.emitChange();
    for (const l of this.overlayListeners) l(false);
  }

  // --- Used by PilotService -------------------------------------------------------------

  /** The armed readback fault, if it targets this aircraft. Call consume() once applied. */
  readbackFaultFor(callsign: string): ReadbackFault | null {
    return this.config.readback && this.targets(callsign) ? this.config.readback : null;
  }

  executionFaultFor(callsign: string): ExecutionFault | null {
    return this.config.execution && this.targets(callsign) ? this.config.execution : null;
  }

  /** The fault was applied: record it, and disarm it in "once" mode. */
  consumeReadbackFault(callsign: string): void {
    const fault = this.config.readback;
    if (!fault) return;
    this.recordInjection(fault.kind, callsign, { ...fault });
    if (fault.once) {
      this.config = { ...this.config, readback: null };
      this.emitChange();
    }
  }

  consumeExecutionFault(callsign: string): void {
    const fault = this.config.execution;
    if (!fault) return;
    this.recordInjection(fault.kind, callsign, { ...fault });
    if (fault.once) {
      this.config = { ...this.config, execution: null };
      this.emitChange();
    }
  }

  /** One-shot "stepped-on transmission": the next readback arrives cut off. */
  takeSteppedOn(callsign: string): boolean {
    if (!this.steppedOnArmed) return false;
    this.steppedOnArmed = false;
    this.recordInjection('stepped_on', callsign, {});
    return true;
  }

  // --- Demo triggers (POST /demo/triggers/:name) ----------------------------------------

  trigger(name: string, body: Record<string, unknown>): DemoTriggerResponse {
    switch (name) {
      case 'no-response':
        this.config = { ...this.config, readback: { kind: 'no_response', once: true } };
        this.emitChange();
        return { ok: true, message: 'Next readback will not come' };
      case 'stepped-on':
        this.steppedOnArmed = true;
        return { ok: true, message: 'Next readback will be stepped on' };
      case 'conflict':
        return this.spawnConflict();
      case 'age-comms': {
        const callsign = this.triggerTarget(body.callsign);
        const ageS = Number(body.ageS);
        if (!callsign || !Number.isFinite(ageS) || ageS < 0) {
          throw new BadRequestException('age-comms needs a known callsign and ageS >= 0');
        }
        this.simulation.setCommsAge(callsign, ageS);
        if (ageS >= this.config.commsLimits.cautionS)
          this.recordInjection('age_comms', callsign, { ageS });
        return {
          ok: true,
          callsign,
          message: `${callsign} last contact ${Math.round(ageS)} s ago`,
        };
      }
      case 'reset-comms': {
        const callsign = this.triggerTarget(body.callsign);
        if (!callsign) throw new BadRequestException('reset-comms needs a known callsign');
        this.simulation.touchContact(callsign);
        return { ok: true, callsign, message: `${callsign} comms timer reset` };
      }
      case 'stats-overlay':
        this.overlayVisible = Boolean(body.visible);
        for (const l of this.overlayListeners) l(this.overlayVisible);
        return { ok: true, message: this.overlayVisible ? 'Results shown' : 'Results hidden' };
      default:
        throw new BadRequestException(`Unknown trigger ${name}`);
    }
  }

  private spawnConflict(): DemoTriggerResponse {
    const aircraft = this.simulation
      .getAircraft()
      .filter((a) => a.callsign !== CONFLICT_INTRUDER.callsign);
    const callsign = this.triggerTarget(undefined) ?? aircraft[0]?.callsign;
    const subject = aircraft.find((a) => a.callsign === callsign);
    if (!subject) throw new BadRequestException('No aircraft to conflict with');

    // Start ahead of the subject, slightly off its track, flying back towards it at its level.
    const bearing = subject.headingDeg + CONFLICT_SPAWN_OFFSET_DEG;
    const ahead = velocity(bearing, 3600); // 1 NM/s unit vector
    const origin = toXy(subject);
    const position = toLatLon({
      x: origin.x + ahead.x * CONFLICT_SPAWN_DISTANCE_NM,
      y: origin.y + ahead.y * CONFLICT_SPAWN_DISTANCE_NM,
    });
    const heading = Math.round((bearing + 180) % 360);
    const altitudeFt = Math.round((subject.target.altitudeFt ?? subject.altitudeFt) / 100) * 100;
    this.simulation.spawn({
      ...CONFLICT_INTRUDER,
      ...position,
      altitudeFt,
      headingDeg: heading,
      verticalSpeedFpm: 0,
      turnRateDegS: 0,
      target: { altitudeFt, headingDeg: heading, speedKt: CONFLICT_INTRUDER.speedKt },
    });
    this.recordInjection('conflict', subject.callsign, { intruder: CONFLICT_INTRUDER.callsign });
    this.logger.log(`Spawned ${CONFLICT_INTRUDER.callsign} towards ${subject.callsign}`);
    return {
      ok: true,
      callsign: subject.callsign,
      message: `${CONFLICT_INTRUDER.telephony} converging on ${subject.callsign}`,
    };
  }

  /** Callsign for a trigger: explicit, else the panel target, else the radar selection. */
  private triggerTarget(explicit: unknown): string | null {
    const known = new Set(this.simulation.getAircraft().map((a) => a.callsign));
    const candidates = [
      typeof explicit === 'string' ? explicit : null,
      this.config.target.mode === 'callsign' ? this.config.target.callsign : null,
      this.selectedCallsign,
    ];
    return candidates.find((c): c is string => !!c && known.has(c)) ?? null;
  }

  private targets(callsign: string): boolean {
    const { mode, callsign: target } = this.config.target;
    if (mode === 'any') return true;
    if (mode === 'callsign') return target === callsign;
    return this.selectedCallsign === null || this.selectedCallsign === callsign;
  }

  private recordInjection(
    kind: FaultKind,
    callsign: string,
    config: Record<string, unknown>,
  ): void {
    const injection = { kind, callsign, expected: EXPECTED_ALERTS[kind], config };
    for (const l of this.injectionListeners) l(injection);
  }

  private emitChange(): void {
    for (const l of this.changeListeners) l(this.config);
  }
}

const READBACK_KINDS = [
  'wrong_altitude',
  'wrong_heading',
  'wrong_turn',
  'wrong_runway',
  'wrong_callsign',
  'incomplete',
  'no_response',
];
const EXECUTION_KINDS = ['turn_wrong_way', 'level_bust', 'wrong_vertical', 'ignore'];

/** PUT /demo/faults comes from a phone: check every field before using it. */
function validate(c: FaultConfig): FaultConfig {
  const bad = (field: string) => new BadRequestException(`Invalid FaultConfig.${field}`);
  if (!c || typeof c !== 'object') throw bad('body');
  if (!['selected', 'callsign', 'any'].includes(c.target?.mode)) throw bad('target');
  if (c.readback && !READBACK_KINDS.includes(c.readback.kind)) throw bad('readback');
  if (c.execution && !EXECUTION_KINDS.includes(c.execution.kind)) throw bad('execution');
  if (typeof c.radioNoise !== 'number' || c.radioNoise < 0 || c.radioNoise > 1)
    throw bad('radioNoise');
  if (![0, 1, 2, 4].includes(c.timeScale)) throw bad('timeScale');
  const { cautionS, warningS } = c.commsLimits ?? {};
  if (!(cautionS > 0 && warningS > cautionS)) throw bad('commsLimits');
  return {
    target: { mode: c.target.mode, callsign: c.target.callsign },
    readback: c.readback ? { ...c.readback, once: c.readback.once !== false } : null,
    execution: c.execution ? { ...c.execution, once: c.execution.once !== false } : null,
    radioNoise: c.radioNoise,
    timeScale: c.timeScale,
    commsLimits: { cautionS, warningS },
  };
}
