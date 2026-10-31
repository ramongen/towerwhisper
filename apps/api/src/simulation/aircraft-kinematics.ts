import { Injectable } from '@nestjs/common';
import type { Aircraft, RunwayId, Waypoint } from '@towerwhisper/shared';
import { AIRCRAFT_TYPES } from '../airport/constants';
import { AIRSPACE, ILS_RUNWAY, runway } from '../airspace/airspace';
import {
  ALIGNED_CROSS_TRACK_NM,
  ALIGNED_HEADING_DEG,
  ALIGNED_MAX_NM,
  ALIGNED_MIN_NM,
  APPROACH_SPEEDS,
  DEFAULT_APPROACH_SPEED_KT,
  GLIDE_SLOPE_FT_PER_NM,
  LEVEL_OFF_FPM_PER_FT,
  JOIN_GLIDE_TOLERANCE_FT,
  LEVEL_OFF_MIN_FPM,
  PROFILE_MARGIN_FT,
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
  /** The pilot has asked for landing clearance on this approach. */
  landingRequested?: boolean;
  /** The controller (or a demo fault) set its altitude: no more descent on its own. */
  altitudeAssigned?: boolean;
  /**
   * Heading the approach steers (intercept, localizer). Kept apart from target.headingDeg,
   * which is only ever a heading the controller assigned ("on vectors").
   */
  approachHeadingDeg?: number;
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
    a.approachHeadingDeg = undefined;
    if (!approach) return;
    const course = runway(approach.runway).trueBearingDeg;
    // alongTrack: NM before the threshold; crossTrack: + = left of the inbound course
    const { alongTrack, crossTrack } = finalApproachPosition(a, approach.runway);
    if (alongTrack < 0) return; // past the threshold: not on this approach

    const pointingInbound = Math.abs(headingDelta(a.headingDeg, course)) < 100;
    if (!a.locCaptured && Math.abs(crossTrack) < LOC_CAPTURE_NM && pointingInbound) {
      a.locCaptured = true;
    }
    // Cleared to land and roughly lined up with the runway: join the final approach now.
    const linedUp =
      Math.abs(crossTrack) < ALIGNED_CROSS_TRACK_NM &&
      Math.abs(headingDelta(a.headingDeg, course)) < ALIGNED_HEADING_DEG &&
      alongTrack > ALIGNED_MIN_NM &&
      alongTrack < ALIGNED_MAX_NM;
    if (!a.locCaptured && a.target.landingCleared && linedUp) a.locCaptured = true;
    if (!a.locCaptured) {
      if (a.target.headingDeg !== undefined) return; // keep flying the vector
      if (a.routeIndex < a.route.length) return; // still on its route: intercept from its end
    }

    const correction = Math.max(
      -LOC_MAX_CORRECTION_DEG,
      Math.min(LOC_MAX_CORRECTION_DEG, crossTrack * LOC_GAIN_DEG_PER_NM),
    );
    a.approachHeadingDeg = normalizeHeading(Math.round(course + correction));

    if (a.locCaptured) {
      // On the localizer: the controller's vector is done, the approach steers now.
      a.target.headingDeg = undefined;
      a.target.turnDir = undefined;
      // 3 degree glide path above the threshold, and slowing down for landing.
      const distance = this.distanceToThreshold(a) ?? 0;
      const glideFt =
        AIRSPACE.airport.elevationFt + Math.round((distance * GLIDE_SLOPE_FT_PER_NM) / 100) * 100;
      if (a.target.altitudeFt === undefined || glideFt < a.target.altitudeFt)
        a.target.altitudeFt = glideFt;
      const scheduled =
        APPROACH_SPEEDS.find((s) => alongTrack > s.beyondNm)?.speedKt ??
        AIRCRAFT_TYPES[a.type]?.approachSpeedKt ??
        DEFAULT_APPROACH_SPEED_KT;
      if (a.target.speedKt === undefined || scheduled < a.target.speedKt)
        a.target.speedKt = scheduled;
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
    if (a.approachHeadingDeg !== undefined) {
      a.navHeadingDeg = undefined; // the approach steers
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
      this.descendOnProfile(a, distanceToGo(a, p));
    } else if (a.route.length > 0) {
      this.endOfRoute(a, p);
    } else {
      a.navHeadingDeg = undefined; // no plan: keep the present heading
    }
  }

  /**
   * Without an altitude from the controller the aircraft descends along its route on the
   * 3:1 rule (the 3 degree glide path extended back, plus a margin), so it reaches the
   * end of the route low enough to start the approach. It only ever descends.
   */
  private descendOnProfile(a: SimAircraft, distanceToGoNm: number): void {
    if (a.altitudeAssigned) return;
    const profileFt = Math.round((glidePathFt(distanceToGoNm) + PROFILE_MARGIN_FT) / 100) * 100;
    if (a.target.altitudeFt === undefined || profileFt < a.target.altitudeFt) {
      a.target.altitudeFt = profileFt;
    }
  }

  /**
   * End of the route (the intermediate fix OZZET, on the runway 26 centreline): start the
   * ILS approach and line up with the runway. Only an aircraft still too high orbits over
   * the fix first, descending, until it can join the glide path.
   */
  private endOfRoute(a: SimAircraft, p: { x: number; y: number }): void {
    const last = a.route[a.route.length - 1];
    a.nextWaypoint = last.name;
    if (a.target.approach) return; // already on an approach: flyApproach steers
    const toThresholdNm = distance(p, toXy(runway(ILS_RUNWAY).threshold));
    const joinFt = glidePathFt(toThresholdNm) + JOIN_GLIDE_TOLERANCE_FT;
    if (a.altitudeFt <= joinFt) {
      a.target.approach = { type: 'ILS', runway: ILS_RUNWAY };
      a.locCaptured = false;
      a.holding = false;
      a.navHeadingDeg = undefined;
      return;
    }
    a.navHeadingDeg = normalizeHeading(a.headingDeg + 90); // a continuous right turn
    a.holding = true;
    if (!a.altitudeAssigned) {
      a.target.altitudeFt = Math.round((joinFt - JOIN_GLIDE_TOLERANCE_FT) / 100) * 100;
    }
  }

  private turn(a: SimAircraft, dtS: number): void {
    const assigned = a.target.headingDeg !== undefined;
    const target = a.target.headingDeg ?? a.approachHeadingDeg ?? a.navHeadingDeg;
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

/** Altitude (ft) of the 3 degree glide path this far (NM) from the threshold. */
function glidePathFt(distanceNm: number): number {
  return AIRSPACE.airport.elevationFt + distanceNm * GLIDE_SLOPE_FT_PER_NM;
}

/** NM along the rest of the route, then from its last fix to the ILS runway threshold. */
function distanceToGo(a: SimAircraft, p: { x: number; y: number }): number {
  let total = 0;
  let from = p;
  for (const fix of a.route.slice(a.routeIndex)) {
    const q = toXy(fix);
    total += distance(from, q);
    from = q;
  }
  return total + distance(from, toXy(runway(ILS_RUNWAY).threshold));
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
