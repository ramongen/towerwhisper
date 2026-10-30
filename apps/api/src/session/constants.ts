export const DEFAULT_SCENARIO = 'craiova-arrivals';

/** Craiova airport (LRCV), runway 09/27 — the centre of the radar scope. */
export const LRCV = {
  icao: 'LRCV',
  lat: 44.3181,
  lon: 23.8886,
  runways: ['09', '27'] as const,
};

/**
 * The phrases of the scripted demo. In no-keys mode they replace the microphone; the
 * pilot audio for their readbacks can be pre-generated into assets/tts-cache.
 */
export const SCRIPTED_PHRASES = [
  'TAROM 301, descend altitude 3000 feet, turn left heading 120',
  'WIZZ 44, descend flight level eight zero, turn right heading 270, reduce speed 220',
  'TAROM 301, cleared ILS approach runway zero niner',
  'TAROM 612, descend altitude 5000 feet',
  'RYANAIR 8KQ, descend flight level 120, turn right heading 100',
  'LOT 2RP, turn left heading 180',
  'LUFTHANSA 9TC, contact Bucharest 121 decimal 3',
  'TAROM 301, negative, descend 3000',
  'BLUE AIR 12, climb flight level 120',
];
