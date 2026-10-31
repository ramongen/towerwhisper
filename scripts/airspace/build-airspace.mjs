// Builds apps/api/scenarios/lrcv-airspace.json from AIP Romania (ROMATSA) documents.
//
//   pdftotext -raw LR_ENR_4_4_en.pdf enr44.txt
//   node scripts/airspace/build-airspace.mjs enr44.txt
//
// ENR 4.4 (name-code designators) gives every significant point with its coordinates; the
// runway, ILS and approach-fix data below were read from AD 2 LRCV and chart AD 2.9-51
// (ILS Z RWY 26) of the same AIRAC cycle. Use `pdftotext -raw`: the -layout mode mixes up
// table rows in ENR 4.4.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'apps', 'api', 'scenarios', 'lrcv-airspace.json');
const AIRAC = 'AIP Romania (ROMATSA), AIRAC effective 29 OCT 2026';
/** Fixes kept for the scope: within this distance of the airport. */
const RADIUS_NM = 130;

/** 441905N / 0235319E (or 44°19'05.0"N) -> decimal degrees. */
const dms = (deg, min, sec) => +(Number(deg) + Number(min) / 60 + Number(sec) / 3600).toFixed(5);

const AIRPORT = {
  icao: 'LRCV',
  name: 'Craiova International',
  lat: dms(44, 19, 5), // ARP 441905N 0235319E (AD 2.2)
  lon: dms(23, 53, 19),
  elevationFt: 628,
};

// AD 2.12: RWY 08/26, 2500 x 45 m, asphalt, PCN 46/F/C/W/T. AD 2.19: ILS on RWY 26 only.
const RUNWAYS = [
  {
    id: '08',
    trueBearingDeg: 88.93,
    threshold: { lat: dms(44, 19, 4.57), lon: dms(23, 52, 22.32) },
    lengthM: 2500,
    widthM: 45,
    ils: null,
  },
  {
    id: '26',
    trueBearingDeg: 268.95,
    threshold: { lat: dms(44, 19, 6.08), lon: dms(23, 54, 15.11) },
    lengthM: 2500,
    widthM: 45,
    ils: { ident: 'ICV', frequencyMhz: '108.700', category: 'II', glideSlopeDeg: 3.0 },
  },
];

// ENR 4.1 / AD 2.19
const NAVAIDS = [
  { ident: 'CRV', name: 'CRAIOVA', type: 'DVOR/DME', frequencyMhz: '110.200', lat: dms(44, 19, 7), lon: dms(23, 55, 21.9) },
];

// AD 2.9-51 ILS Z RWY 26: initial approach fixes and intermediate fix.
const APPROACH_ROLES = { TITEK: 'IAF', PEMOK: 'IAF', PANZU: 'IAF', OZZET: 'IF' };

const text = readFileSync(resolve(process.argv[2] ?? 'enr44.txt'), 'utf8');
const re = /^([A-Z]{5}) (\d{2})(\d{2})(\d{2})N (\d{3})(\d{2})(\d{2})E (.*)$/gm;
const cosLat = Math.cos((AIRPORT.lat * Math.PI) / 180);
const fixes = [];
for (const m of text.matchAll(re)) {
  const lat = dms(m[2], m[3], m[4]);
  const lon = dms(m[5], m[6], m[7]);
  const distanceNm = Math.hypot((lon - AIRPORT.lon) * 60 * cosLat, (lat - AIRPORT.lat) * 60);
  if (distanceNm > RADIUS_NM) continue;
  const routes = m[8].replace(/\s*FRA.*$/, '').replace(/\s*NIL\s*$/, '').trim();
  fixes.push({
    name: m[1],
    lat,
    lon,
    ...(APPROACH_ROLES[m[1]] ? { role: APPROACH_ROLES[m[1]] } : {}),
    ...(routes ? { routes } : {}),
  });
}
for (const name of Object.keys(APPROACH_ROLES)) {
  if (!fixes.some((f) => f.name === name)) throw new Error(`${name} missing from ENR 4.4`);
}

writeFileSync(
  OUT,
  JSON.stringify({ source: AIRAC, airport: AIRPORT, runways: RUNWAYS, navaids: NAVAIDS, fixes }, null, 2) + '\n',
);
console.log(`${fixes.length} fixes within ${RADIUS_NM} NM -> ${OUT}`);
