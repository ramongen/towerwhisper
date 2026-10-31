import type { AirportWeather } from '@towerwhisper/shared';
import { AIRCRAFT_TYPES } from '../src/airport/constants';
import { assessRunways } from '../src/airport/runway-advisor';
import { decodeMetar } from '../src/weather/weather.service';

function weather(wdir: number, wspd: number, wx: string | null = null): AirportWeather {
  return decodeMetar({ rawOb: 'METAR LRCV', wdir, wspd, visib: '10+', wxString: wx, clouds: [] });
}

describe('runway advisor', () => {
  it('recommends the runway into the wind', () => {
    const [r08, r26] = assessRunways(AIRCRAFT_TYPES.B738, 63_200, weather(250, 10));
    expect(r26).toMatchObject({ compatible: true, recommended: true, headwindKt: 9 });
    expect(r08).toMatchObject({ compatible: true, recommended: false, headwindKt: -9 });
    expect(r08.requiredLandingM).toBeGreaterThan(r26.requiredLandingM);
  });

  it('rejects a direction with too much tailwind', () => {
    const [r08] = assessRunways(AIRCRAFT_TYPES.A21N, 75_800, weather(270, 15));
    expect(r08.compatible).toBe(false);
    expect(r08.notes).toContain('tailwind 15 kt > 10 kt');
  });

  it('rejects a crosswind above the type limit', () => {
    const results = assessRunways(AIRCRAFT_TYPES.CRJ9, 33_200, weather(0, 30));
    expect(results.every((r) => !r.compatible)).toBe(true);
    expect(results[0].notes).toContain('crosswind 30 kt > 27 kt');
  });

  it('adds 15% on a wet runway and scales with weight', () => {
    const dry = assessRunways(AIRCRAFT_TYPES.B738, 66_361, weather(90, 0))[0];
    const wet = assessRunways(AIRCRAFT_TYPES.B738, 66_361, weather(90, 0, '-RA'))[0];
    expect(dry.requiredLandingM).toBe(1630);
    expect(wet.requiredLandingM).toBe(1880);
  });

  it('works without weather, saying the wind is unknown', () => {
    const [r08] = assessRunways(AIRCRAFT_TYPES.AT76, 21_500, null);
    expect(r08).toMatchObject({ compatible: true, headwindKt: null });
    expect(r08.notes).toContain('wind unknown');
  });
});
