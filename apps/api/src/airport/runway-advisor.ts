import type { AircraftTypeInfo, AirportWeather, RunwayAssessment } from '@towerwhisper/shared';
import { CRAIOVA, type Airspace } from '../airspace/airspace';
import { componentsFor } from '../weather/weather.service';
import { MAX_TAILWIND_KT, TAILWIND_FACTOR_PER_KT, WET_RUNWAY_FACTOR } from './constants';

/**
 * Which runway direction of the sector's airport suits this aircraft at its declared landing weight, in the
 * current wind. A simplified planning model (landing distance scales with weight, +15% wet,
 * +2.5% per knot of tailwind), clearly advisory: it never raises an alert.
 */
export function assessRunways(
  type: AircraftTypeInfo,
  landingWeightKg: number,
  weather: AirportWeather | null,
  airspace: Airspace = CRAIOVA,
): RunwayAssessment[] {
  const weightFactor = landingWeightKg / type.mlwKg;
  const wet = weather?.wetRunway ?? false;

  const assessments = airspace.toResponse().runways.map((rwy): RunwayAssessment => {
    const notes: string[] = [];
    let compatible = true;

    const wind = weather
      ? componentsFor(rwy.id, weather.windDirDeg, weather.windSpeedKt, airspace)
      : null;
    const gust = weather?.windGustKt ?? null;
    const tailwind = wind ? Math.max(0, -wind.headwindKt) : 0;

    let required = type.landingFieldLengthM * weightFactor;
    if (wet) required *= WET_RUNWAY_FACTOR;
    required *= 1 + TAILWIND_FACTOR_PER_KT * tailwind;
    const requiredLandingM = Math.round(required / 10) * 10;

    if (landingWeightKg > type.mlwKg) {
      compatible = false;
      notes.push(`declared weight above MLW (${fmt(type.mlwKg)} kg)`);
    }
    if (requiredLandingM > rwy.lengthM) {
      compatible = false;
      notes.push(`needs ${fmt(requiredLandingM)} m, ${fmt(rwy.lengthM)} m available`);
    } else {
      notes.push(
        `${fmt(requiredLandingM)} m needed of ${fmt(rwy.lengthM)} m${wet ? ' (wet)' : ''}`,
      );
    }
    if (rwy.widthM < type.minRunwayWidthM) {
      compatible = false;
      notes.push(`code ${type.aerodromeCode} needs ${type.minRunwayWidthM} m width`);
    }
    if (wind) {
      const crosswind = Math.max(
        wind.crosswindKt,
        gust ? componentsFor(rwy.id, weather!.windDirDeg, gust, airspace).crosswindKt : 0,
      );
      if (tailwind > MAX_TAILWIND_KT) {
        compatible = false;
        notes.push(`tailwind ${tailwind} kt > ${MAX_TAILWIND_KT} kt`);
      } else if (tailwind > 0) {
        notes.push(`tailwind ${tailwind} kt`);
      }
      if (crosswind > type.maxCrosswindKt) {
        compatible = false;
        notes.push(`crosswind ${crosswind} kt > ${type.maxCrosswindKt} kt`);
      }
    } else {
      notes.push('wind unknown');
    }
    notes.push(
      rwy.ils ? `ILS ${rwy.ils.ident} ${rwy.ils.frequencyMhz}`.trim() : 'no ILS (RNP / VOR)',
    );

    return {
      runway: rwy.id,
      compatible,
      recommended: false,
      requiredLandingM,
      availableM: rwy.lengthM,
      headwindKt: wind?.headwindKt ?? null,
      crosswindKt: wind?.crosswindKt ?? null,
      notes,
    };
  });

  const best = assessments
    .filter((a) => a.compatible)
    .sort(
      (a, b) =>
        (b.headwindKt ?? 0) - (a.headwindKt ?? 0) || (a.runway === airspace.ilsRunway ? -1 : 1),
    )[0];
  if (best) best.recommended = true;
  return assessments;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
