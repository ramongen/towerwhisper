import { Injectable } from '@nestjs/common';
import type { Aircraft } from '@towerwhisper/shared';
import {
  GLIDE_SLOPE_FT_PER_NM,
  LEVEL_OFF_FPM_PER_FT,
  LEVEL_OFF_MIN_FPM,
  LOC_CAPTURE_NM,
  LOC_GAIN_DEG_PER_NM,
  LOC_MAX_CORRECTION_DEG,
  RUNWAY_HALF_LENGTH_NM,
  SPEED_CHANGE_KT_S,
  TURN_RATE_DEG_S,
  VERTICAL_RATE_MAX_FPM,
  VERTICAL_RATE_MIN_FPM,
} from './constants';
import { headingDelta, normalizeHeading, toLatLon, toXy, velocity } from './geo';

/** Aircraft plus simulator-only state that is never sent to the browser. */
export interface SimAircraft extends Aircraft {
  /** true once the ILS localizer is captured; the approach then steers heading and altitude. */
  locCaptured?: boolean;
}

/**
 * Moves one aircraft towards its targets: standard-rate turns in the cleared direction,
 * 1500-2000 ft/min climbs and descents that ease off near the target level, 2 kt/s speed
 * changes, and a simple ILS (localizer capture, then 3° glide slope).
 */
@Injectable()
export class AircraftKinematics {
  step(a: SimAircraft, dtS: number): void {
    if (dtS <= 0) {
      a.turnRateDegS = 0;
      return;
    }
    this.flyApproach(a);
    this.turn(a, dtS);
    this.climbOrDescend(a, dtS);
    this.changeSpeed(a, dtS);

    const v = velocity(a.headingDeg, a.speedKt);
    const p = toXy(a);
    const next = toLatLon({ x: p.x + v.x * dtS, y: p.y + v.y * dtS });
    a.lat = next.lat;
    a.lon = next.lon;
  }

  /** Distance (NM) from the threshold of the cleared runway, or null without an approach. */
  distanceToThreshold(a: SimAircraft): number | null {
    if (!a.target.approach) return null;
    const p = toXy(a);
    const thresholdX =
      a.target.approach.runway === '09' ? -RUNWAY_HALF_LENGTH_NM : RUNWAY_HALF_LENGTH_NM;
    return Math.hypot(p.x - thresholdX, p.y);
  }

  private flyApproach(a: SimAircraft): void {
    const approach = a.target.approach;
    if (!approach) return;
    const course = approach.runway === '09' ? 90 : 270;
    const p = toXy(a);
    // On the approach side of the field, i.e. west of it for runway 09.
    const alongTrack = approach.runway === '09' ? -p.x : p.x;
    const crossTrack = approach.runway === '09' ? p.y : -p.y; // + = left of the inbound course
    if (alongTrack < 0) return;

    const pointingInbound = Math.abs(headingDelta(a.headingDeg, course)) < 100;
    if (!a.locCaptured && Math.abs(crossTrack) < LOC_CAPTURE_NM && pointingInbound) {
      a.locCaptured = true;
    }
    if (!a.locCaptured && a.target.headingDeg !== undefined) return; // keep flying the vector

    const correction = Math.max(
      -LOC_MAX_CORRECTION_DEG,
      Math.min(LOC_MAX_CORRECTION_DEG, crossTrack * LOC_GAIN_DEG_PER_NM),
    );
    a.target.headingDeg = normalizeHeading(Math.round(course + correction));
    a.target.turnDir = 'any';

    if (a.locCaptured) {
      const distance = this.distanceToThreshold(a) ?? 0;
      const glideFt = Math.round((distance * GLIDE_SLOPE_FT_PER_NM) / 100) * 100;
      if (a.target.altitudeFt === undefined || glideFt < a.target.altitudeFt)
        a.target.altitudeFt = glideFt;
    }
  }

  private turn(a: SimAircraft, dtS: number): void {
    const target = a.target.headingDeg;
    if (target === undefined) {
      a.turnRateDegS = 0;
      return;
    }
    const dir = a.target.turnDir ?? 'any';
    let remaining: number; // degrees still to turn, in the direction we turn
    let sign: number;
    if (dir === 'left') {
      remaining = normalizeHeading(a.headingDeg - target);
      sign = -1;
    } else if (dir === 'right') {
      remaining = normalizeHeading(target - a.headingDeg);
      sign = 1;
    } else {
      const delta = headingDelta(a.headingDeg, target);
      remaining = Math.abs(delta);
      sign = Math.sign(delta);
    }

    if (remaining < 0.5) {
      a.headingDeg = target % 360;
      a.turnRateDegS = 0;
      a.target.turnDir = 'any'; // reached: later corrections take the short way
      return;
    }
    const step = Math.min(TURN_RATE_DEG_S * dtS, remaining);
    a.headingDeg = normalizeHeading(a.headingDeg + sign * step);
    a.turnRateDegS = (sign * step) / dtS;
  }

  private climbOrDescend(a: SimAircraft, dtS: number): void {
    const target = a.target.altitudeFt;
    if (target === undefined) {
      a.verticalSpeedFpm = 0;
      return;
    }
    const diff = target - a.altitudeFt;
    if (Math.abs(diff) < 10) {
      a.altitudeFt = target;
      a.verticalSpeedFpm = 0;
      return;
    }
    const rate = Math.min(
      verticalRateOf(a.callsign),
      Math.max(LEVEL_OFF_MIN_FPM, Math.abs(diff) * LEVEL_OFF_FPM_PER_FT),
    );
    const change = Math.min((rate / 60) * dtS, Math.abs(diff));
    a.altitudeFt += Math.sign(diff) * change;
    a.verticalSpeedFpm = Math.sign(diff) * rate;
  }

  private changeSpeed(a: SimAircraft, dtS: number): void {
    const target = a.target.speedKt;
    if (target === undefined) return;
    const diff = target - a.speedKt;
    a.speedKt += Math.sign(diff) * Math.min(SPEED_CHANGE_KT_S * dtS, Math.abs(diff));
  }
}

/** A fixed climb/descent rate per aircraft in 1500-2000 ft/min, so traffic does not move in lockstep. */
export function verticalRateOf(callsign: string): number {
  let hash = 0;
  for (const ch of callsign) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return VERTICAL_RATE_MIN_FPM + (hash / 1000) * (VERTICAL_RATE_MAX_FPM - VERTICAL_RATE_MIN_FPM);
}
