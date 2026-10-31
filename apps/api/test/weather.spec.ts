import { componentsFor, decodeMetar } from '../src/weather/weather.service';

describe('weather decoding', () => {
  // Real LRCV observation from aviationweather.gov.
  const metar = {
    rawOb: 'METAR LRCV 302300Z 25005KT 3000 -RADZ BR BKN002 OVC038 10/10 Q1021',
    obsTime: 1793401200,
    wdir: 250,
    wspd: 5,
    visib: 1.86,
    altim: 1021,
    temp: 10,
    dewp: 10,
    wxString: '-RA -DZ BR',
    clouds: [
      { cover: 'BKN', base: 200 },
      { cover: 'OVC', base: 3800 },
    ],
    fltCat: 'LIFR',
  };

  it('decodes the METAR into controller units', () => {
    const w = decodeMetar(metar);
    expect(w).toMatchObject({
      source: 'metar',
      windDirDeg: 250,
      windSpeedKt: 5,
      visibilityM: 3000,
      ceilingFt: 200,
      qnhHpa: 1021,
      flightCategory: 'LIFR',
      wetRunway: true,
      preferredRunway: '26',
    });
  });

  it('splits the wind along each runway', () => {
    expect(componentsFor('26', 250, 20)).toEqual({ runway: '26', headwindKt: 19, crosswindKt: 6 });
    expect(componentsFor('08', 250, 20)).toEqual({ runway: '08', headwindKt: -19, crosswindKt: 6 });
  });

  it('treats a variable wind as tailwind and crosswind', () => {
    expect(componentsFor('08', null, 4)).toEqual({ runway: '08', headwindKt: -4, crosswindKt: 4 });
  });

  it('prefers 26 (the ILS runway) when calm', () => {
    expect(decodeMetar({ ...metar, wdir: 0, wspd: 0, wxString: null }).preferredRunway).toBe('26');
  });
});
