export const DEFAULT_SCENARIO = 'craiova-arrivals';

/** Craiova airport (LRCV) reference point (AIP AD 2.2) — the centre of the radar scope. */
export const LRCV = {
  icao: 'LRCV',
  lat: 44.31806,
  lon: 23.88861,
};

/**
 * The phrases of the scripted demo. In no-keys mode they replace the microphone; the
 * pilot audio for their readbacks can be pre-generated into assets/tts-cache.
 */
export const SCRIPTED_PHRASES = [
  'TAROM 301, descend altitude 4000 feet, turn left heading 080',
  'WIZZ 44, descend altitude 5000 feet, turn left heading 240, reduce speed 220',
  'WIZZ 44, cleared ILS approach runway two six',
  'TAROM 612, descend altitude 6000 feet',
  'RYANAIR 8KQ, descend flight level 120, turn left heading 140',
  'LOT 2RP, turn left heading 200',
  'LUFTHANSA 9TC, proceed direct PANZU',
  'TAROM 301, proceed direct OZZET',
  'TAROM 301, negative, descend 4000',
  'BLUE AIR 12, climb flight level 120',
];
