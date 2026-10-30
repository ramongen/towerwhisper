import type { AircraftTypeInfo, AirspaceResponse } from '@towerwhisper/shared';
import { LRCV } from '../session/constants';

/**
 * Craiova International (LRCV): one runway, 09/27. Length and width from public AIP data,
 * rounded; good enough for planning advice in a simulation, not for operations.
 */
export const AIRPORT: AirspaceResponse['airport'] = {
  icao: LRCV.icao,
  name: 'Craiova International',
  lat: LRCV.lat,
  lon: LRCV.lon,
  elevationFt: 626,
};

export const RUNWAYS: AirspaceResponse['runways'] = [
  { id: '09', headingDeg: 90, lengthM: 2500, widthM: 45, ils: true },
  { id: '27', headingDeg: 270, lengthM: 2500, widthM: 45, ils: true },
];

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
    minRunwayWidthM: 45,
  },
};
