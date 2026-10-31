import type { AirspaceFix } from '@towerwhisper/shared';
import { LRCV_AIRSPACE_DATA, type AirspaceData } from '../airspace/airspace';
import { Geo, normalizeHeading } from '../simulation/geo';
import { APPROACH_POINTS, FIX_RADIUS_NM, METRES_PER_NM, SIMULATED_POINT_NOTE } from './constants';

/**
 * Airports of the approach sectors other than Craiova. Craiova is built from the AIP
 * (lrcv-airspace.json); for these we keep the published aerodrome data (reference point,
 * elevation, runway designators, length, which runway has the ILS) and derive the thresholds
 * from the reference point along the runway's true bearing, so they are approximate.
 * ILS idents and frequencies are not modelled here.
 */
interface AirportSpec {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number;
  /** Runway in use when calm: the arrivals fly its ILS. */
  defaultRunway: string;
  /** Runway pairs: the first designator's true bearing, length, lateral offset (m, + = right). */
  runways: {
    ids: [string, string];
    trueBearingDeg: number;
    lengthM: number;
    widthM: number;
    offsetM?: number;
    ils: string[];
  }[];
  /**
   * Arrival entry points where our AIP extract has none for this airport (it covers 130 NM
   * around Craiova): simulated, by true bearing and distance from the airport.
   */
  simulatedEntries?: { name: string; bearingDeg: number; distanceNm: number }[];
}

const SPECS: AirportSpec[] = [
  {
    icao: 'LROP',
    name: 'Bucharest Henri Coandă',
    lat: 44.5717,
    lon: 26.085,
    elevationFt: 314,
    defaultRunway: '26R',
    runways: [
      {
        ids: ['08L', '26R'],
        trueBearingDeg: 85.5,
        lengthM: 3500,
        widthM: 45,
        offsetM: -400,
        ils: ['08L', '26R'],
      },
      {
        ids: ['08R', '26L'],
        trueBearingDeg: 85.5,
        lengthM: 3500,
        widthM: 45,
        offsetM: 400,
        ils: ['08R', '26L'],
      },
    ],
  },
  {
    icao: 'LRTR',
    name: 'Timișoara Traian Vuia',
    lat: 45.8097,
    lon: 21.3381,
    elevationFt: 348,
    defaultRunway: '29',
    runways: [{ ids: ['11', '29'], trueBearingDeg: 114, lengthM: 3500, widthM: 45, ils: ['29'] }],
  },
  {
    icao: 'LRCL',
    name: 'Cluj Avram Iancu',
    lat: 46.7847,
    lon: 23.6861,
    elevationFt: 1036,
    defaultRunway: '25',
    runways: [{ ids: ['07', '25'], trueBearingDeg: 75, lengthM: 3500, widthM: 45, ils: ['25'] }],
  },
  {
    icao: 'LROD',
    name: 'Oradea International',
    lat: 47.0253,
    lon: 21.9025,
    elevationFt: 465,
    defaultRunway: '01',
    runways: [{ ids: ['01', '19'], trueBearingDeg: 8, lengthM: 2100, widthM: 45, ils: ['01'] }],
    simulatedEntries: [
      { name: 'ODSOU', bearingDeg: 180, distanceNm: 34 },
      { name: 'ODSEA', bearingDeg: 135, distanceNm: 38 },
      { name: 'ODEAS', bearingDeg: 80, distanceNm: 36 },
      { name: 'ODNOR', bearingDeg: 20, distanceNm: 40 },
      { name: 'ODNWE', bearingDeg: 320, distanceNm: 37 },
      { name: 'ODWES', bearingDeg: 250, distanceNm: 35 },
    ],
  },
];

/** The airspace data of an airport: runways, the real fixes around it, simulated approach points. */
export function airspaceFor(icao: string): AirspaceData {
  if (icao === 'LRCV') return LRCV_AIRSPACE_DATA;
  const spec = SPECS.find((s) => s.icao === icao);
  if (!spec) throw new Error(`No airport data for ${icao}`);

  const geo = new Geo(spec);
  const runways: AirspaceData['runways'] = [];
  for (const pair of spec.runways) {
    const rad = (pair.trueBearingDeg * Math.PI) / 180;
    const along = { x: Math.sin(rad), y: Math.cos(rad) };
    const right = { x: Math.cos(rad), y: -Math.sin(rad) };
    const halfNm = pair.lengthM / 2 / METRES_PER_NM;
    const offNm = (pair.offsetM ?? 0) / METRES_PER_NM;
    const centre = { x: right.x * offNm, y: right.y * offNm };
    // First designator: lands along the bearing, so its threshold is the end it starts from.
    const ends = [
      { x: centre.x - along.x * halfNm, y: centre.y - along.y * halfNm },
      { x: centre.x + along.x * halfNm, y: centre.y + along.y * halfNm },
    ];
    pair.ids.forEach((id, i) => {
      runways.push({
        id,
        trueBearingDeg: i === 0 ? pair.trueBearingDeg : normalizeHeading(pair.trueBearingDeg + 180),
        threshold: round(geo.toLatLon(ends[i])),
        lengthM: pair.lengthM,
        widthM: pair.widthM,
        ils: pair.ils.includes(id)
          ? { ident: `ILS ${id}`, frequencyMhz: '', category: 'I', glideSlopeDeg: 3 }
          : null,
      });
    });
  }

  const fixes: AirspaceFix[] = LRCV_AIRSPACE_DATA.fixes
    .filter((f) => Math.hypot(geo.toXy(f).x, geo.toXy(f).y) <= FIX_RADIUS_NM)
    .map(({ name, lat, lon, routes }) => ({ name, lat, lon, ...(routes ? { routes } : {}) }));
  fixes.push(
    ...approachPoints(
      geo,
      runways.find((r) => r.id === spec.defaultRunway)!,
    ),
  );
  for (const entry of spec.simulatedEntries ?? []) {
    const rad = (entry.bearingDeg * Math.PI) / 180;
    fixes.push({
      name: entry.name,
      ...round(
        geo.toLatLon({ x: Math.sin(rad) * entry.distanceNm, y: Math.cos(rad) * entry.distanceNm }),
      ),
      // Read by the arrivals generator like a real STAR point of this airport.
      routes: `STAR ${spec.icao} (simulated entry point)`,
    });
  }

  return {
    source:
      `${spec.name}: runways derived from published aerodrome data (approximate); ` +
      `fixes from ${LRCV_AIRSPACE_DATA.source}; ${SIMULATED_POINT_NOTE}`,
    airport: {
      icao: spec.icao,
      name: spec.name,
      lat: spec.lat,
      lon: spec.lon,
      elevationFt: spec.elevationFt,
    },
    runways,
    navaids: [],
    fixes,
    defaultRunway: spec.defaultRunway,
  };
}

/**
 * Simulated approach points for the ILS runway: the intermediate fix on the extended
 * centreline (CF26L) and a left and right base point (LB26L, RB26L) the arrivals turn in from.
 */
function approachPoints(geo: Geo, rwy: AirspaceData['runways'][number]): AirspaceFix[] {
  const t = geo.toXy(rwy.threshold);
  const rad = (rwy.trueBearingDeg * Math.PI) / 180;
  const along = { x: Math.sin(rad), y: Math.cos(rad) };
  const right = { x: Math.cos(rad), y: -Math.sin(rad) };
  const at = (out: number, side: number) =>
    round(
      geo.toLatLon({
        x: t.x - along.x * out + right.x * side,
        y: t.y - along.y * out + right.y * side,
      }),
    );
  const { intermediateNm, baseNm, baseOffsetNm } = APPROACH_POINTS;
  const routes = SIMULATED_POINT_NOTE;
  return [
    { name: `CF${rwy.id}`, ...at(intermediateNm, 0), role: 'IF', routes },
    { name: `LB${rwy.id}`, ...at(baseNm, -baseOffsetNm), role: 'IAF', routes },
    { name: `RB${rwy.id}`, ...at(baseNm, baseOffsetNm), role: 'IAF', routes },
  ];
}

function round(p: { lat: number; lon: number }): { lat: number; lon: number } {
  return { lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5 };
}
