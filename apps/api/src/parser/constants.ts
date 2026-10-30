/** LlmParser runs only when no rule matched, with this hard timeout. */
export const LLM_TIMEOUT_MS = 2000;

/** Claude model used by the fallback parser. */
export const LLM_MODEL = 'claude-haiku-5-5';

/** CallsignResolver: max Levenshtein distance on the telephony name (digits must match exactly). */
export const CALLSIGN_MAX_NAME_DISTANCE = 2;

/** Confidence reported for rule matches, with and without a callsign heard in the phrase. */
export const RULES_CONFIDENCE = 0.95;
export const RULES_CONFIDENCE_FALLBACK_CALLSIGN = 0.7;
export const LLM_CONFIDENCE = 0.6;

/** ICAO pronunciation of digits. */
export const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  wun: '1',
  two: '2',
  three: '3',
  tree: '3',
  four: '4',
  fower: '4',
  five: '5',
  fife: '5',
  six: '6',
  seven: '7',
  eight: '8',
  ait: '8',
  nine: '9',
  niner: '9',
};

/** ICAO phonetic alphabet, used in callsigns like 'LUFTHANSA 9 TANGO CHARLIE'. */
export const PHONETIC_LETTERS: Record<string, string> = {
  alpha: 'a',
  alfa: 'a',
  bravo: 'b',
  charlie: 'c',
  delta: 'd',
  echo: 'e',
  foxtrot: 'f',
  golf: 'g',
  hotel: 'h',
  india: 'i',
  juliet: 'j',
  juliett: 'j',
  kilo: 'k',
  lima: 'l',
  mike: 'm',
  november: 'n',
  oscar: 'o',
  papa: 'p',
  quebec: 'q',
  romeo: 'r',
  sierra: 's',
  tango: 't',
  uniform: 'u',
  victor: 'v',
  whiskey: 'w',
  xray: 'x',
  yankee: 'y',
  zulu: 'z',
};

/** ATC vocabulary for the Whisper prompt; session callsigns are added in front. */
export const STT_VOCABULARY =
  'descend, climb, maintain, flight level, altitude, feet, heading, turn left, turn right, ' +
  'reduce speed, knots, cleared ILS approach runway zero niner, contact, decimal, negative, ' +
  'tango, charlie, romeo, papa, kilo, quebec';
