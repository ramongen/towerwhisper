import type { Waypoint } from '@towerwhisper/shared';
import type { Airspace } from '../airspace/airspace';
import { AIRCRAFT_TYPES } from '../airport/constants';
import type { Scenario, ScenarioAircraft } from '../session/scenario-loader';
import { GLIDE_SLOPE_FT_PER_NM, PROFILE_MARGIN_FT } from '../simulation/constants';
import { bearing, type Xy } from '../simulation/geo';
import {
  ARRIVAL_LEVEL_STEP_FT,
  ARRIVAL_MAX_FT,
  ARRIVAL_MIN_FT,
  ARRIVAL_SPACING_NM,
  ENTRY_MAX_NM,
  ENTRY_MIN_NM,
  FIRST_ARRIVAL_NM,
  GENERATED_ARRIVALS,
} from './constants';

/** Airlines and types the generated arrivals use (types we have performance data for). */
const OPERATORS = [
  { icao: 'ROT', telephony: 'TAROM', types: ['AT76', 'B738'] },
  { icao: 'WZZ', telephony: 'WIZZ', types: ['A21N'] },
  { icao: 'RYR', telephony: 'RYANAIR', types: ['B38M', 'B738'] },
  { icao: 'DLH', telephony: 'LUFTHANSA', types: ['CRJ9'] },
  { icao: 'LOT', telephony: 'LOT', types: ['E195'] },
  { icao: 'AUA', telephony: 'AUSTRIAN', types: ['E195'] },
  { icao: 'THY', telephony: 'TURKISH', types: ['B738'] },
];
const DEPARTURES = ['LROP', 'LRTR', 'LRCL', 'LOWW', 'EDDF', 'LTFM', 'EPWA', 'LHBP', 'EGSS'];

/**
 * Arrivals for a sector without a hand-made scenario: one aircraft per real STAR point of the
 * airport (spread around it), routed STAR point -> base point -> intermediate fix, placed so
 * that, left alone, they reach the final approach about 4 minutes apart. Deterministic per
 * sector, so a reset always gives the same traffic.
 */
export function generateArrivals(sectorId: string, airspace: Airspace): Scenario {
  const random = seeded(sectorId);
  const geo = airspace.geo;
  const icao = airspace.airport.icao;
  const ils = airspace.runway(airspace.ilsRunway);
  const threshold = geo.toXy(ils.threshold);
  const intermediate = airspace.intermediateFix();
  const bases = airspace.fixes.filter((f) => f.role === 'IAF');

  const entries = pickSpread(
    airspace.fixes.filter((f) => {
      if (f.role || !arrivalPointOf(f.routes, icao)) return false;
      const d = Math.hypot(geo.toXy(f).x, geo.toXy(f).y);
      return d >= ENTRY_MIN_NM && d <= ENTRY_MAX_NM;
    }),
    GENERATED_ARRIVALS,
    geo.toXy.bind(geo),
  );

  const used = new Set<string>();
  const aircraft: ScenarioAircraft[] = entries.map((entry, i) => {
    const entryXy = geo.toXy(entry);
    // The base point on the entry's side of the final approach, then the intermediate fix.
    const base = bases
      .map((b) => ({ b, d: Math.hypot(geo.toXy(b).x - entryXy.x, geo.toXy(b).y - entryXy.y) }))
      .sort((a, b) => a.d - b.d)[0]?.b;
    const route: Waypoint[] = [entry, base, intermediate]
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map(({ name, lat, lon }) => ({ name, lat, lon }));
    const routeNm = pathNm([...route.map((w) => geo.toXy(w)), threshold]);

    // Start on the line from the airport through the entry point, out far enough that the
    // track miles to the threshold give this arrival its place in the sequence.
    const wanted = FIRST_ARRIVAL_NM + i * ARRIVAL_SPACING_NM;
    const outNm = Math.max(4, wanted - routeNm);
    const dist = Math.hypot(entryXy.x, entryXy.y) || 1;
    const start: Xy = {
      x: entryXy.x + (entryXy.x / dist) * outNm,
      y: entryXy.y + (entryXy.y / dist) * outNm,
    };
    // Each arrival on its own level, the first lowest; never above its descent profile.
    const toGoNm = outNm + routeNm;
    const profile =
      airspace.airport.elevationFt + toGoNm * GLIDE_SLOPE_FT_PER_NM + PROFILE_MARGIN_FT;
    const altitudeFt = clamp(
      Math.min(Math.floor(profile / 1000) * 1000, ARRIVAL_MIN_FT + i * ARRIVAL_LEVEL_STEP_FT),
      ARRIVAL_MIN_FT,
      ARRIVAL_MAX_FT,
    );
    const speedKt = altitudeFt > 10000 ? 280 : 230;

    const operator = OPERATORS[Math.floor(random() * OPERATORS.length)];
    const type = operator.types[Math.floor(random() * operator.types.length)];
    let flight = flightNumber(random);
    while (used.has(operator.icao + flight)) flight = flightNumber(random);
    used.add(operator.icao + flight);
    const mlw = AIRCRAFT_TYPES[type]?.mlwKg ?? 60_000;

    return {
      callsign: operator.icao + flight,
      telephony: `${operator.telephony} ${flight}`,
      type,
      ...geo.toLatLon(start),
      altitudeFt,
      headingDeg: Math.round(bearing(start, entryXy)),
      speedKt,
      verticalSpeedFpm: 0,
      turnRateDegS: 0,
      target: { altitudeFt, speedKt },
      flightPlan: {
        departure: DEPARTURES.filter((d) => d !== icao)[
          Math.floor(random() * (DEPARTURES.length - 1))
        ],
        destination: icao,
        route,
        cruiseLevel: 240 + Math.floor(random() * 10) * 10,
        declaredLandingWeightKg: Math.round((mlw * (0.82 + random() * 0.12)) / 100) * 100,
      },
      routeIndex: 0,
    };
  });

  return {
    name: `${sectorId}-arrivals`,
    airport: icao,
    fixes: airspace.fixes.map(({ name, lat, lon }) => ({ name, lat, lon })),
    aircraft,
  };
}

/**
 * Whether ENR 4.4 lists the point on a STAR or approach chart of this airport. The notes
 * read like 'STAR, IAC LROP', 'SID LRCL, STAR LRTM' or 'SID/STAR LRAR, SID/STAR LRTR':
 * procedure kinds apply to the airports that follow them.
 */
export function arrivalPointOf(routes: string | undefined, icao: string): boolean {
  if (!routes) return false;
  let pending: string[] = [];
  for (const token of routes.split(',')) {
    const words = token.trim().split(/\s+/);
    const kinds = words.flatMap((w) => w.split('/')).filter((w) => /^(SID|STAR|IAC)$/.test(w));
    const airports = words.flatMap((w) => w.split('/')).filter((w) => /^LR[A-Z]{2}$/.test(w));
    pending = [...pending, ...kinds];
    if (airports.length === 0) continue;
    if (airports.includes(icao) && pending.some((k) => k === 'STAR' || k === 'IAC')) return true;
    pending = [];
  }
  return false;
}

/** Up to n points, spread around the airport: greedily the one farthest in bearing from those taken. */
function pickSpread<T extends { name: string }>(points: T[], n: number, toXy: (p: T) => Xy): T[] {
  const withBearing = points
    .map((p) => ({ p, brg: bearing({ x: 0, y: 0 }, toXy(p)) }))
    .sort((a, b) => a.p.name.localeCompare(b.p.name));
  const taken: typeof withBearing = [];
  while (taken.length < n && taken.length < withBearing.length) {
    let best = withBearing.find((c) => !taken.includes(c))!;
    let bestGap = -1;
    for (const c of withBearing) {
      if (taken.includes(c)) continue;
      const gap = taken.length
        ? Math.min(...taken.map((t) => Math.abs(((c.brg - t.brg + 540) % 360) - 180)))
        : 360;
      if (gap > bestGap) {
        best = c;
        bestGap = gap;
      }
    }
    taken.push(best);
  }
  return taken.map((t) => t.p);
}

function pathNm(points: Xy[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/** '301' or '8KQ', the two shapes of flight numbers in the scenario. */
function flightNumber(random: () => number): string {
  if (random() < 0.6) return String(100 + Math.floor(random() * 900));
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const pick = () => letters[Math.floor(random() * letters.length)];
  return `${1 + Math.floor(random() * 9)}${pick()}${pick()}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Small deterministic generator (mulberry32) seeded from a string. */
function seeded(seed: string): () => number {
  let h = 1779033703;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
