// Demo panel fault configuration — spec section 11.

export interface FaultConfig {
  target: { mode: 'selected' | 'callsign' | 'any'; callsign?: string };
  readback: null | {
    kind:
      | 'wrong_altitude'
      | 'wrong_heading'
      | 'wrong_turn'
      | 'wrong_runway'
      | 'wrong_callsign'
      | 'incomplete'
      | 'no_response';
    altitudeOffsetFt?: number;
    once: boolean;
  };
  execution: null | {
    kind: 'turn_wrong_way' | 'level_bust' | 'wrong_vertical' | 'ignore';
    overshootFt?: number;
    once: boolean;
  };
  radioNoise: number; // 0-1
  timeScale: 0 | 1 | 2 | 4;
  commsLimits: { cautionS: number; warningS: number }; // default 900 / 1800; demo 15 / 30
}
