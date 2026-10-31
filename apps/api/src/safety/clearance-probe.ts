import type {
  Aircraft,
  LatLon,
  ProbeConflict,
  ProbeResultPayload,
  Targets,
} from '@towerwhisper/shared';
import { AlertRegistry, alertKey } from './alert-registry';
import {
  CONFLICT_HORIZONTAL_NM,
  CONFLICT_LOOKAHEAD_S,
  CONFLICT_VERTICAL_FT,
  PROBE_STEP_S,
} from './constants';

const DEG = Math.PI / 180;
/** Probe-only motion model: standard turn, mid-range vertical rate. */
const PROBE_TURN_DEG_S = 3;
const PROBE_VERTICAL_FPM = 1800;

interface Point {
  x: number; // NM east of the first aircraft's reference
  y: number; // NM north
  altFt: number;
}

/**
 * Projects trajectories in 5 s steps over 5 minutes and finds the closest approach between
 * aircraft. CONFLICT_PREDICTED when it is under 3 NM and 1000 ft. Used for a new clearance
 * (before the aircraft executes it) and periodically on current traffic.
 */
export class ClearanceProbe {
  /** One fixed longitude scale for every aircraft (the sector's latitude), so positions compare. */
  private readonly cosRef: number;

  constructor(
    private readonly alerts: AlertRegistry,
    refLat = 44.32,
  ) {
    this.cosRef = Math.cos(refLat * DEG);
  }

  /** What happens if `callsign` flies `targets`: its path and the conflicts it would create. */
  probe(callsign: string, targets: Targets, aircraft: Aircraft[]): ProbeResultPayload {
    const subject = aircraft.find((a) => a.callsign === callsign);
    if (!subject) return { callsign, path: [], conflicts: [] };
    const own = project({ ...subject, target: { ...subject.target, ...targets } }, this.cosRef);
    const conflicts: ProbeConflict[] = [];
    for (const other of aircraft) {
      if (other.callsign === callsign) continue;
      const c = closestApproach(own, project(other, this.cosRef));
      if (c) conflicts.push({ callsign: other.callsign, ...c });
    }
    const path = own.filter((_, i) => i % 2 === 0).map((p) => toLatLon(p, this.cosRef));
    return { callsign, path, conflicts };
  }

  /** Raises / clears CONFLICT_PREDICTED for every pair on their current targets. */
  scan(aircraft: Aircraft[]): void {
    const paths = new Map(aircraft.map((a) => [a.callsign, project(a, this.cosRef)]));
    const found = new Set<string>();
    for (let i = 0; i < aircraft.length; i++) {
      for (let j = i + 1; j < aircraft.length; j++) {
        const a = aircraft[i].callsign;
        const b = aircraft[j].callsign;
        const c = closestApproach(paths.get(a)!, paths.get(b)!);
        if (!c) continue;
        const key = this.raise(a, { callsign: b, ...c });
        found.add(key);
      }
    }
    this.alerts.clearWhere(
      (key, alert) => alert.type === 'CONFLICT_PREDICTED' && !found.has(key),
      'no conflict predicted any more',
    );
  }

  /** Raises the alert for one predicted conflict; returns its key. */
  raise(callsign: string, c: ProbeConflict): string {
    const key = alertKey('CONFLICT_PREDICTED', callsign, c.callsign);
    const minutes = Math.floor(c.tMinS / 60);
    const seconds = Math.round(c.tMinS % 60);
    this.alerts.raise(key, {
      type: 'CONFLICT_PREDICTED',
      severity: 'warning',
      callsigns: [callsign, c.callsign],
      message:
        `${callsign} and ${c.callsign} predicted ${c.horizontalNm.toFixed(1)} NM / ${c.verticalFt} ft apart ` +
        `in ${minutes ? `${minutes} min ` : ''}${seconds} s`,
      details: { ...c },
    });
    return key;
  }
}

/** Positions every PROBE_STEP_S seconds, in NM (x east, y north). */
function project(a: Aircraft, cosRef: number): Point[] {
  const points: Point[] = [];
  let x = a.lon * 60 * cosRef;
  let y = a.lat * 60;
  let hdg = a.headingDeg;
  let alt = a.altitudeFt;
  let turnDir = a.target.turnDir ?? 'any';
  for (let t = 0; t <= CONFLICT_LOOKAHEAD_S; t += PROBE_STEP_S) {
    points.push({ x, y, altFt: alt });
    const targetHdg = a.target.headingDeg;
    if (targetHdg !== undefined) {
      const left = (((hdg - targetHdg) % 360) + 360) % 360;
      const right = (((targetHdg - hdg) % 360) + 360) % 360;
      const sign = turnDir === 'left' ? -1 : turnDir === 'right' ? 1 : right <= left ? 1 : -1;
      const remaining = sign > 0 ? right : left;
      const step = Math.min(PROBE_TURN_DEG_S * PROBE_STEP_S, remaining);
      hdg = (hdg + sign * step + 360) % 360;
      if (step === remaining) turnDir = 'any';
    }
    if (a.target.altitudeFt !== undefined) {
      const diff = a.target.altitudeFt - alt;
      alt += Math.sign(diff) * Math.min(Math.abs(diff), (PROBE_VERTICAL_FPM / 60) * PROBE_STEP_S);
    }
    const nm = (a.speedKt / 3600) * PROBE_STEP_S;
    x += Math.sin(hdg * DEG) * nm;
    y += Math.cos(hdg * DEG) * nm;
  }
  return points;
}

/** First time both separations are lost; null when they never are within the look-ahead. */
function closestApproach(a: Point[], b: Point[]): Omit<ProbeConflict, 'callsign'> | null {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const h = Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
    const v = Math.abs(a[i].altFt - b[i].altFt);
    if (h < CONFLICT_HORIZONTAL_NM && v < CONFLICT_VERTICAL_FT) {
      // Report the minimum distance from here on, while separation stays lost.
      let best = { tMinS: i * PROBE_STEP_S, horizontalNm: h, verticalFt: Math.round(v) };
      for (let j = i + 1; j < Math.min(a.length, b.length); j++) {
        const hj = Math.hypot(a[j].x - b[j].x, a[j].y - b[j].y);
        if (hj >= best.horizontalNm) break;
        best = {
          tMinS: j * PROBE_STEP_S,
          horizontalNm: hj,
          verticalFt: Math.round(Math.abs(a[j].altFt - b[j].altFt)),
        };
      }
      best.horizontalNm = Math.round(best.horizontalNm * 10) / 10;
      return best;
    }
  }
  return null;
}

function toLatLon(p: Point, cosRef: number): LatLon {
  const lat = p.y / 60;
  return { lat, lon: p.x / (60 * cosRef) };
}
