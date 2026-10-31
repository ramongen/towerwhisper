import type { AircraftTypeInfo, AirspaceResponse } from '@towerwhisper/shared';
import { AIRSPACE } from '../airspace/airspace';

/** Craiova International (LRCV), from AIP Romania AD 2 LRCV: runway 08/26, 2500 x 45 m, ILS 26. */
export const AIRPORT: AirspaceResponse['airport'] = AIRSPACE.airport;

export const RUNWAYS: AirspaceResponse['runways'] = AIRSPACE.runways.map((r) => ({
  id: r.id,
  headingDeg: r.trueBearingDeg,
  threshold: r.threshold,
  lengthM: r.lengthM,
  widthM: r.widthM,
  ils: r.ils ? { ident: r.ils.ident, frequencyMhz: r.ils.frequencyMhz } : null,
}));

/** Landing distance factors of the simplified planning model. */
export const WET_RUNWAY_FACTOR = 1.15;
/** Extra landing distance per knot of tailwind. */
export const TAILWIND_FACTOR_PER_KT = 0.025;
/** Usual operator limit for landing with a tailwind. */
export const MAX_TAILWIND_KT = 10;

/**
 * Approximate published figures of the scenario's types (manufacturer brochures, EASA type
 * certificates). Landing field length: certified, at MLW, dry runway, sea level.
 */
export const AIRCRAFT_TYPES: Record<string, AircraftTypeInfo> = {
  AT76: {
    icao: 'AT76',
    model: 'ATR 72-600',
    wakeCategory: 'M',
    aerodromeCode: '3C',
    mtowKg: 23_000,
    mlwKg: 22_350,
    wingspanM: 27.05,
    landingFieldLengthM: 915,
    maxCrosswindKt: 35,
    approachSpeedKt: 115,
    minRunwayWidthM: 30,
  },
  A21N: {
    icao: 'A21N',
    model: 'Airbus A321neo',
    wakeCategory: 'M',
    aerodromeCode: '4C',
    mtowKg: 97_000,
    mlwKg: 79_200,
    wingspanM: 35.8,
    landingFieldLengthM: 1745,
    maxCrosswindKt: 33,
    approachSpeedKt: 140,
    minRunwayWidthM: 45,
  },
  B738: {
    icao: 'B738',
    model: 'Boeing 737-800',
    wakeCategory: 'M',
    aerodromeCode: '4C',
    mtowKg: 79_016,
    mlwKg: 66_361,
    wingspanM: 35.79,
    landingFieldLengthM: 1634,
    maxCrosswindKt: 33,
    approachSpeedKt: 145,
    minRunwayWidthM: 45,
  },
  E195: {
    icao: 'E195',
    model: 'Embraer E195',
    wakeCategory: 'M',
    aerodromeCode: '4C',
    mtowKg: 52_290,
    mlwKg: 45_000,
    wingspanM: 28.72,
    landingFieldLengthM: 1275,
    maxCrosswindKt: 30,
    approachSpeedKt: 135,
    minRunwayWidthM: 45,
  },
  B38M: {
    icao: 'B38M',
    model: 'Boeing 737 MAX 8',
    wakeCategory: 'M',
    aerodromeCode: '4C',
    mtowKg: 82_191,
    mlwKg: 69_309,
    wingspanM: 35.92,
    landingFieldLengthM: 1600,
    maxCrosswindKt: 33,
    approachSpeedKt: 145,
    minRunwayWidthM: 45,
  },
  CRJ9: {
    icao: 'CRJ9',
    model: 'Bombardier CRJ900',
    wakeCategory: 'M',
    aerodromeCode: '4C',
    mtowKg: 38_330,
    mlwKg: 34_065,
    wingspanM: 24.85,
    landingFieldLengthM: 1596,
    maxCrosswindKt: 27,
    approachSpeedKt: 140,
    minRunwayWidthM: 45,
  },
  B737: {
    icao: 'B737',
    model: 'Boeing 737-700',
    wakeCategory: 'M',
    aerodromeCode: '4C',
    mtowKg: 70_080,
    mlwKg: 58_604,
    wingspanM: 35.79,
    landingFieldLengthM: 1415,
    maxCrosswindKt: 33,
    approachSpeedKt: 135,
    minRunwayWidthM: 45,
  },
};
