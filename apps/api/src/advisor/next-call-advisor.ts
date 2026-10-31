import type {
  Advisory,
  AdvisoryKind,
  Aircraft,
  AirportWeather,
  FlightPlan,
  RunwayId,
  Waypoint,
} from '@towerwhisper/shared';
import type { Airspace } from '../airspace/airspace';
import { finalApproachPosition } from '../simulation/aircraft-kinematics';
import {
  GLIDE_SLOPE_FT_PER_NM,
  GO_AROUND_NM,
  JOIN_GLIDE_TOLERANCE_FT,
} from '../simulation/constants';
import { bearing, headingDelta, normalizeHeading } from '../simulation/geo';
import { TRANSITION_ALTITUDE_FT } from '../sectors/constants';
import {
  ADVISORY_QUIET_MS,
  APPROACH_ADVICE_NM,
  CIRCUIT,
  HEADING_TOLERANCE_DEG,
  INTERCEPT_DEG,
  LANDING_ADVICE_NM,
  LANDING_URGENT_S,
  ON_FINAL_CROSS_TRACK_NM,
  ON_FINAL_HEADING_DEG,
  POOR_INTERCEPT_DEG,
  POOR_INTERCEPT_PENALTY_NM,
  TURN_PENALTY_NM,
} from './constants';

/** What the advisor knows about one aircraft besides its radar state. */
export interface AdvisoryContext {
  flightPlan?: FlightPlan;
  /** Fixes still ahead on own navigation (empty on vectors). */
  remainingRoute: Waypoint[];
  weather: AirportWeather | null;
  /** Sim ms since the controller last called this aircraft (null: never). */
  sinceAtcMs: number | null;
}

interface Advice {
  kind: AdvisoryKind;
  title: string;
  phrase: string;
  reason: string;
  basis: string[];
  urgency?: Advisory['urgency'];
}

/**
 * The call the controller should probably make next, from the aircraft's flight plan, where
 * it is relative to the ILS and the wind. Plain rules, no AI and no network: the same state
 * always gives the same advice, and it is advice only (nothing is transmitted). In order:
 *
 * 1. On final without a landing clearance: clear it to land (it goes around otherwise).
 * 2. Flying its flight plan to the start of the approach: clear it for the approach
 *    (with a descent when it is holding too high to join the glide path).
 * 3. On vectors, on the arrival side: the best fix back to the approach (direct-to).
 * 4. After a go-around, or vectored inside the IF: the next heading of the circuit back
 *    onto the localizer (crosswind, downwind, base, intercept).
 *
 * Every phrase is standard phraseology our own parser understands (test/advisor.spec.ts).
 */
export class NextCallAdvisor {
  constructor(private readonly airspace: Airspace) {}

  advise(a: Aircraft, ctx: AdvisoryContext): Advisory | undefined {
    if (ctx.sinceAtcMs !== null && ctx.sinceAtcMs < ADVISORY_QUIET_MS) return undefined;
    const advice =
      this.landing(a, ctx) ??
      (a.target.approach ? null : this.approach(a, ctx)) ??
      (a.target.approach ? null : this.offRoute(a, ctx));
    if (!advice) return undefined;
    return {
      id: `${a.callsign}:${advice.kind}:${advice.phrase}`,
      urgency: 'normal',
      ...advice,
    };
  }

  // --- 1. Landing clearance ---------------------------------------------------------------

  private landing(a: Aircraft, ctx: AdvisoryContext): Advice | null {
    const approach = a.target.approach;
    if (!approach || a.target.landingCleared) return null;
    const rwy = this.airspace.runway(approach.runway);
    const { alongTrack, crossTrack } = finalApproachPosition(this.airspace, a, approach.runway);
    const lined =
      Math.abs(crossTrack) < ON_FINAL_CROSS_TRACK_NM &&
      Math.abs(headingDelta(a.headingDeg, rwy.trueBearingDeg)) < ON_FINAL_HEADING_DEG;
    if (!lined || alongTrack <= GO_AROUND_NM || alongTrack > LANDING_ADVICE_NM) return null;

    const secondsLeft = ((alongTrack - GO_AROUND_NM) / Math.max(60, a.speedKt)) * 3600;
    const wind = windPhrase(ctx.weather);
    const runwayWind = ctx.weather?.runwayWind.find((w) => w.runway === approach.runway);
    return {
      kind: 'landing-clearance',
      title: 'Clear to land',
      phrase: `${a.telephony}, cleared to land runway ${spokenRunway(approach.runway)}${wind ? `, ${wind}` : ''}`,
      reason:
        `On the ${approach.type} ${approach.runway}, ${nm(alongTrack)} from the threshold, without a ` +
        `landing clearance. Without one it goes around at ${GO_AROUND_NM} NM, ` +
        `in about ${duration(secondsLeft)}.`,
      basis: [
        `${approach.type} ${approach.runway}: ${nm(alongTrack)} to go, ${Math.round(a.altitudeFt)} ft, ${a.speedKt} kt`,
        ctx.weather ? `Wind ${windText(ctx.weather)}` : 'No live wind: give the tower wind',
        ...(runwayWind
          ? [`Runway ${approach.runway}: ${headTail(runwayWind.headwindKt)}, crosswind ${Math.abs(runwayWind.crosswindKt)} kt`]
          : []),
      ],
      urgency: secondsLeft < LANDING_URGENT_S ? 'urgent' : 'normal',
    };
  }

  // --- 2. Approach clearance --------------------------------------------------------------

  private approach(a: Aircraft, ctx: AdvisoryContext): Advice | null {
    if (a.target.headingDeg !== undefined || ctx.remainingRoute.length === 0) return null;
    const intermediate = this.airspace.intermediateFix();
    const last = ctx.remainingRoute[ctx.remainingRoute.length - 1];
    if (!intermediate || last.name !== intermediate.name) return null;
    const toGo = pathNm(this.airspace, a, ctx.remainingRoute);
    if (!a.holding && toGo > APPROACH_ADVICE_NM) return null;

    const runway = this.airspace.ilsRunway;
    const ifToThreshold = this.airspace.distanceNm(intermediate, this.airspace.runway(runway).threshold);
    const glideAtIf = this.airspace.airport.elevationFt + ifToThreshold * GLIDE_SLOPE_FT_PER_NM;
    const tooHigh = (a.target.altitudeFt ?? a.altitudeFt) > glideAtIf + JOIN_GLIDE_TOLERANCE_FT;
    const descendTo = Math.floor(glideAtIf / 500) * 500;
    const descent = tooHigh ? `${altitudePhrase('descend', descendTo)}, ` : '';
    const route = ctx.flightPlan?.route.map((w) => w.name).join(' ');

    return {
      kind: 'approach-clearance',
      title: tooHigh ? 'Descend and clear for the approach' : 'Clear for the approach',
      phrase: `${a.telephony}, ${descent}cleared ILS approach runway ${spokenRunway(runway)}`,
      reason: a.holding
        ? `Holding over ${intermediate.name} at ${Math.round(a.altitudeFt)} ft: too high to join the ` +
          `3° glide path there (at most ${round100(glideAtIf + JOIN_GLIDE_TOLERANCE_FT)} ft). ` +
          `Descend it to ${descendTo} ft and clear it for the ILS ${runway}.`
        : `Flying its flight plan to ${intermediate.name}, where the ILS ${runway} starts, ` +
          `${nm(toGo)} to go, and not cleared for the approach yet.` +
          (tooHigh ? ` At ${Math.round(a.altitudeFt)} ft it is too high to join the glide path: descend it to ${descendTo} ft.` : ''),
      basis: [
        ...(route ? [`Flight plan: ${route} (${ctx.flightPlan!.departure} → ${ctx.flightPlan!.destination})`] : []),
        `Next fix: ${ctx.remainingRoute[0].name}, then ${ctx.remainingRoute.slice(1).map((w) => w.name).join(' ') || 'the ILS'}`,
        `ILS ${runway} from ${intermediate.name}: glide path ${round100(glideAtIf)} ft there`,
        ...(ctx.weather ? [`Runway in use: ${ctx.weather.preferredRunway} (wind ${windText(ctx.weather)})`] : []),
      ],
      urgency: a.holding ? 'urgent' : 'normal',
    };
  }

  // --- 3 & 4. Off the route: direct-to or the circuit back ------------------------------

  private offRoute(a: Aircraft, ctx: AdvisoryContext): Advice | null {
    const onVectors = a.target.headingDeg !== undefined;
    // A go-around flies its own missed-approach pattern, whose points are not published fixes.
    const onMissedApproach =
      !onVectors && !!a.nextWaypoint && !this.airspace.fix(a.nextWaypoint);
    if (!onVectors && !onMissedApproach) return null;

    const runway = this.airspace.ilsRunway;
    const intermediate = this.airspace.intermediateFix();
    const { alongTrack, crossTrack } = finalApproachPosition(this.airspace, a, runway);
    const ifAlong = intermediate
      ? finalApproachPosition(this.airspace, intermediate, runway).alongTrack
      : CIRCUIT.maxFinalNm / 2;
    // Near the airport (or flying the missed approach): vectors round the circuit, which
    // also gives the intercept when it is heading for the centreline. Farther out: the
    // best fix back to the approach.
    const nearAirport =
      Math.abs(crossTrack) < CIRCUIT.areaNm && alongTrack < ifAlong + CIRCUIT.baseNm;
    const intercepting = this.interceptLeg(a, runway, ifAlong) !== null;
    if (onVectors && !nearAirport && !intercepting && intermediate) {
      return this.directTo(a, ctx, intermediate, runway);
    }
    return this.circuit(a, ctx, runway, ifAlong, onMissedApproach);
  }

  /** The fix that gets the aircraft back onto the approach with the least flying and turning. */
  private directTo(
    a: Aircraft,
    ctx: AdvisoryContext,
    intermediate: Waypoint,
    runway: RunwayId,
  ): Advice | null {
    const geo = this.airspace.geo;
    const course = this.airspace.runway(runway).trueBearingDeg;
    const heading = a.target.headingDeg ?? a.headingDeg;
    const plan = (ctx.flightPlan?.route ?? []).filter((w) => this.airspace.fix(w.name));
    const ifIndex = plan.findIndex((w) => w.name === intermediate.name);
    const names = [...new Set([...plan.map((w) => w.name), intermediate.name])];

    const options = names.map((name) => {
      const fix = this.airspace.fix(name)!;
      const toFix = this.airspace.distanceNm(a, fix);
      // On to the IF along the flight plan when the fix is on it, else straight.
      const index = plan.findIndex((w) => w.name === name);
      const onward =
        name === intermediate.name
          ? []
          : index >= 0 && ifIndex > index
            ? plan.slice(index + 1, ifIndex + 1)
            : [intermediate];
      const thenNm = pathNm(this.airspace, fix, onward);
      const track = bearing(geo.toXy(a), geo.toXy(fix));
      const turnDeg = Math.round(Math.abs(headingDelta(heading, track)));
      // Straight to the IF from the wrong side means a big turn onto the localizer there;
      // the published routes to the IF are fine as filed.
      const poor =
        name === intermediate.name &&
        Math.abs(headingDelta(track, course)) > POOR_INTERCEPT_DEG;
      const cost =
        toFix + thenNm + (turnDeg / 180) * TURN_PENALTY_NM + (poor ? POOR_INTERCEPT_PENALTY_NM : 0);
      return { name, toFix, thenNm, turnDeg, track, onward, cost, onPlan: index >= 0 };
    });
    options.sort((x, y) => x.cost - y.cost);
    const best = options[0];
    if (!best) return null;

    const toIf = best.name === intermediate.name;
    const turn = headingDelta(heading, best.track) < 0 ? 'left' : 'right';
    const route = plan.map((w) => w.name).join(' ');
    return {
      kind: 'direct-to',
      title: `Direct ${best.name}`,
      phrase:
        `${a.telephony}, proceed direct ${best.name}` +
        (toIf ? `, cleared ILS approach runway ${spokenRunway(runway)}` : ''),
      reason:
        `On vectors (heading ${pad3(heading)}), off its flight plan. ${best.name} is the shortest way ` +
        `back to the ILS ${runway}: ${nm(best.toFix)} to ${best.name}` +
        (toIf
          ? `, where the approach starts`
          : `, then ${nm(best.thenNm)} via ${best.onward.map((w) => w.name).join(' ')}`) +
        (best.turnDeg >= 10 ? `; a ${best.turnDeg}° ${turn} turn.` : '; almost straight ahead.'),
      basis: [
        ...(route ? [`Flight plan: ${route} (${ctx.flightPlan!.departure} → ${ctx.flightPlan!.destination})`] : []),
        `Destination ${this.airspace.airport.icao}, ILS ${runway} from ${intermediate.name}`,
        ...options
          .slice(1, 3)
          .map((o) => `Also possible: ${o.name}, ${nm(o.toFix + o.thenNm)} in all, ${o.turnDeg}° turn`),
      ],
    };
  }

  /**
   * The 30 degree intercept onto the localizer, when the aircraft is close to the centreline,
   * within range of the final and heading for it (not from downwind: that turns base first).
   */
  private interceptLeg(a: Aircraft, runway: RunwayId, ifAlong: number): CircuitLeg | null {
    const course = this.airspace.runway(runway).trueBearingDeg;
    const { alongTrack, crossTrack } = finalApproachPosition(this.airspace, a, runway);
    const heading = a.target.headingDeg ?? a.headingDeg;
    const abeam = Math.abs(crossTrack);
    const inbound = Math.abs(headingDelta(heading, course)) < 100;
    const inRange =
      alongTrack >= ifAlong - CIRCUIT.insideIfNm && alongTrack <= CIRCUIT.maxFinalNm;
    if (!inbound || !inRange || abeam >= CIRCUIT.abeamNm) return null;
    const side = sideOf(crossTrack);
    return {
      name: 'Intercept',
      headingDeg: course + INTERCEPT_DEG * side,
      clearsApproach: true,
      why: `${nm(abeam)} ${side > 0 ? 'left' : 'right'} of the final course, ${nm(alongTrack)} out: a ${INTERCEPT_DEG}° intercept onto the localizer`,
    };
  }

  /** Crosswind, downwind, base, intercept: a right-hand circuit unless already on the left. */
  private circuit(
    a: Aircraft,
    ctx: AdvisoryContext,
    runway: RunwayId,
    ifAlong: number,
    afterGoAround: boolean,
  ): Advice | null {
    const course = this.airspace.runway(runway).trueBearingDeg;
    const { alongTrack, crossTrack } = finalApproachPosition(this.airspace, a, runway);
    const side = sideOf(crossTrack);
    const abeam = Math.abs(crossTrack);
    const heading = a.target.headingDeg ?? a.headingDeg;
    const approach = `cleared ILS approach runway ${spokenRunway(runway)}`;

    let leg: CircuitLeg;
    const intercept = this.interceptLeg(a, runway, ifAlong);
    if (intercept) {
      leg = intercept;
    } else if (alongTrack >= ifAlong + CIRCUIT.pastIfNm) {
      leg = {
        name: 'Base',
        headingDeg: course + 90 * side,
        clearsApproach: false,
        why: `${nm(alongTrack)} out, past the IF: base turn towards the centreline`,
      };
    } else if (abeam < CIRCUIT.downwindNm) {
      leg = {
        name: 'Crosswind',
        headingDeg: course - 90 * side,
        clearsApproach: false,
        why: `${alongTrack < 0 ? 'past the runway' : 'inside the IF'}, ${nm(abeam)} from the centreline: turn crosswind to start the circuit`,
      };
    } else {
      leg = {
        name: 'Downwind',
        headingDeg: course + 180,
        clearsApproach: false,
        why: `${nm(abeam)} abeam the final course: downwind until past the IF (${nm(ifAlong)} out)`,
      };
    }

    const target = roundHeading(leg.headingDeg);
    const delta = headingDelta(heading, target);
    const flyingIt = Math.abs(delta) <= HEADING_TOLERANCE_DEG;
    if (flyingIt && !leg.clearsApproach) return null;
    const turn = flyingIt ? '' : `turn ${delta < 0 ? 'left' : 'right'} heading ${pad3(target)}`;
    const parts = [turn, leg.clearsApproach ? approach : ''].filter(Boolean);
    const route = ctx.flightPlan?.route.map((w) => w.name).join(' ');

    return {
      kind: 'vectors',
      title: `${leg.name}${leg.clearsApproach ? ' and clear for the ILS' : ''}`,
      phrase: `${a.telephony}, ${parts.join(', ')}`,
      reason:
        `${afterGoAround ? 'Went around and is flying the missed-approach pattern' : `On vectors (heading ${pad3(heading)})`}; ` +
        `${leg.why}.`,
      basis: [
        `Circuit to the ILS ${runway}: crosswind, downwind, base, ${INTERCEPT_DEG}° intercept`,
        `Position: ${nm(alongTrack)} ${alongTrack < 0 ? 'past' : 'before'} the threshold, ${nm(abeam)} ${side > 0 ? 'left' : 'right'} of the final course`,
        `Altitude ${Math.round(a.altitudeFt)} ft, ${a.speedKt} kt`,
        ...(route ? [`Flight plan: ${route} (${ctx.flightPlan!.destination})`] : []),
      ],
      urgency: afterGoAround ? 'urgent' : 'normal',
    };
  }
}

interface CircuitLeg {
  name: string;
  headingDeg: number;
  clearsApproach: boolean;
  why: string;
}

/** +1 left of the inbound course, -1 right of it (the default circuit side, near the centreline). */
function sideOf(crossTrackNm: number): 1 | -1 {
  return crossTrackNm > CIRCUIT.centrelineNm / 2 ? 1 : -1;
}

// --- Phraseology helpers ------------------------------------------------------------------

/** '26' -> '26', '08R' -> '08 right' (as the parser reads it). */
function spokenRunway(id: RunwayId): string {
  const side = { L: ' left', R: ' right', C: ' center' }[id.slice(-1)] ?? '';
  return side ? `${id.slice(0, -1)}${side}` : id;
}

function altitudePhrase(action: 'descend' | 'climb', ft: number): string {
  return ft > TRANSITION_ALTITUDE_FT
    ? `${action} flight level ${Math.round(ft / 100)}`
    : `${action} altitude ${ft} feet`;
}

/** 'wind 250 degrees 5 knots', from the airport weather; null when calm, variable or unknown. */
function windPhrase(w: AirportWeather | null): string | null {
  if (!w || w.windDirDeg === null || w.windSpeedKt < 1) return null;
  return `wind ${pad3(roundHeading(w.windDirDeg))} degrees ${w.windSpeedKt} knots`;
}

function windText(w: AirportWeather): string {
  if (w.windSpeedKt < 1) return 'calm';
  const dir = w.windDirDeg === null ? 'variable' : `${pad3(w.windDirDeg)}°`;
  return `${dir} ${w.windSpeedKt} kt${w.windGustKt ? ` gusting ${w.windGustKt}` : ''}`;
}

function headTail(headwindKt: number): string {
  return headwindKt >= 0 ? `headwind ${headwindKt} kt` : `tailwind ${-headwindKt} kt`;
}

/** Headings in tens, 360 for north. */
function roundHeading(deg: number): number {
  const h = Math.round(normalizeHeading(deg) / 10) * 10;
  return h === 0 ? 360 : h;
}

function pad3(n: number): string {
  return String(Math.round(n)).padStart(3, '0');
}

function nm(value: number): string {
  return `${Math.abs(value).toFixed(1)} NM`;
}

function round100(ft: number): number {
  return Math.round(ft / 100) * 100;
}

function duration(s: number): string {
  const total = Math.max(0, Math.round(s));
  if (total < 60) return `${total} s`;
  const m = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

/** NM from a point along a list of fixes. */
function pathNm(airspace: Airspace, from: { lat: number; lon: number }, fixes: Waypoint[]): number {
  let total = 0;
  let at = from;
  for (const f of fixes) {
    total += airspace.distanceNm(at, f);
    at = f;
  }
  return total;
}
