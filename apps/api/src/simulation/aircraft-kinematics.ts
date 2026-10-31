import { Injectable } from '@nestjs/common';
import type { Aircraft, RunwayId, Waypoint } from '@towerwhisper/shared';
import { runway } from '../airspace/airspace';
import {
  GLIDE_SLOPE_FT_PER_NM,
  LEVEL_OFF_FPM_PER_FT,
  LEVEL_OFF_MIN_FPM,
  LOC_CAPTURE_NM,
  LOC_GAIN_DEG_PER_NM,
  LOC_MAX_CORRECTION_DEG,
  SPEED_CHANGE_KT_S,
  TURN_RATE_DEG_S,
  VERTICAL_RATE_MAX_FPM,
  VERTICAL_RATE_MIN_FPM,
  WAYPOINT_REACHED_NM,
} from './constants';
import { headingDelta, normalizeHeading, toLatLon, toXy, velocity } from './geo';

/** Aircraft plus simulator-only state that is never sent to the browser. */
export interface SimAircraft extends Aircraft {
  /** true once the ILS localizer is captured; the approach then steers heading and altitude. */
  locCaptured?: boolean;
  /** Fixes the aircraft navigates by itself (flight plan, or from a direct-to). */
  route: Waypoint[];
  /** Index in route of the fix flown to; past the end the aircraft holds over the last fix. */
  routeIndex: number;
  /** Heading own navigation steers to while no heading is assigned. */
  navHeadingDeg?: number;
}

/**
 * Moves one aircraft towards its targets: standard-rate turns in the cleared direction,
 * 1500-2000 ft/min climbs and descents that ease off near the target level, 2 kt/s speed
 * changes, and a simple ILS (localizer capture, then 3° glide slope). Without an assigned
 * heading the aircraft flies its flight plan and holds over the last fix.
 */
@Injectable()
export class AircraftKinematics {
  step(a: SimAircraft, dtS: number): void {
    if (dtS <= 0) {
      a.turnRateDegS = 0;
      return;
    }
    this.flyApproach(a);
    this.navigate(a);
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
    const { alongTrack, crossTrack } = finalApproachPosition(a, a.target.approach.runway);
    return Math.hypot(alongTrack, crossTrack);
  }

  private flyApproach(a: SimAircraft): void {
    const approach = a.target.approach;
    if (!approach) return;
    const course = runway(approach.runway).trueBearingDeg;
    // alongTrack: NM before the threshold; crossTrack: + = left of the inbound course
    const { alongTrack, crossTrack } = finalApproachPosition(a, approach.runway);
    if (alongTrack < 0) return; // past the threshold: not on this approach

    const pointingInbound = Math.abs(headingDelta(a.headingDeg, course)) < 100;
    if (!a.locCaptured && Math.abs(crossTrack) < LOC_CAPTURE_NM && pointingInbound) {
      a.locCaptured = true;
    }
    if (!a.locCaptured) {
      if (a.target.headingDeg !== undefined) return; // keep flying the vector
      if (a.routeIndex < a.route.length) return; // still on its route: intercept from its end
    }

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

  /** Own navigation: steer to the next fix of the route, or orbit right over the last one. */
  private navigate(a: SimAircraft): void {
    if (a.target.headingDeg !== undefined) {
      a.navHeadingDeg = undefined;
      a.nextWaypoint = undefined;
      a.holding = false;
      return;
    }
    const p = toXy(a);
    let next = a.route[a.routeIndex];
    while (next && distance(p, toXy(next)) < WAYPOINT_REACHED_NM) {
      a.routeIndex++;
      next = a.route[a.routeIndex];
    }
    if (next) {
      const q = toXy(next);
      a.navHeadingDeg = normalizeHeading((Math.atan2(q.x - p.x, q.y - p.y) * 180) / Math.PI);
      a.nextWaypoint = next.name;
      a.holding = false;
    } else if (a.route.length > 0) {
      a.navHeadingDeg = normalizeHeading(a.headingDeg + 90); // a continuous right turn
      a.nextWaypoint = a.route[a.route.length - 1].name;
      a.holding = true;
    } else {
      a.navHeadingDeg = undefined; // no plan: keep the present heading
    }
  }

  private turn(a: SimAircraft, dtS: number): void {
    const assigned = a.target.headingDeg !== undefined;
    const target = a.target.headingDeg ?? a.navHeadingDeg;
    if (target === undefined) {
      a.turnRateDegS = 0;
      return;
    }
    const dir = assigned ? (a.target.turnDir ?? 'any') : 'any';
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
      if (assigned) a.target.turnDir = 'any'; // reached: later corrections take the short way
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

/**
 * Position relative to the final approach of a runway, from its real threshold and true
 * course (AIP): NM still to fly to the threshold, and NM left (+) / right (-) of the course.
 */
export function finalApproachPosition(
  a: { lat: number; lon: number },
  id: RunwayId,
): { alongTrack: number; crossTrack: number } {
  const rwy = runway(id);
  const t = toXy(rwy.threshold);
  const p = toXy(a);
  const rad = (rwy.trueBearingDeg * Math.PI) / 180;
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  // u = inbound direction (sin, cos); the aircraft is before the threshold when d.u < 0.
  const alongTrack = -(dx * Math.sin(rad) + dy * Math.cos(rad));
  const crossTrack = -(dx * Math.cos(rad) - dy * Math.sin(rad));
  return { alongTrack, crossTrack };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A fixed climb/descent rate per aircraft in 1500-2000 ft/min, so traffic does not move in lockstep. */
export function verticalRateOf(callsign: string): number {
  let hash = 0;
  for (const ch of callsign) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return VERTICAL_RATE_MIN_FPM + (hash / 1000) * (VERTICAL_RATE_MAX_FPM - VERTICAL_RATE_MIN_FPM);
}
