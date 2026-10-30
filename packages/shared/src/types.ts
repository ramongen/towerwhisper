// Domain types — spec section 7. Used identically by apps/api and apps/web.

export type TurnDir = 'left' | 'right' | 'any';

export interface Aircraft {
  callsign: string; // 'ROT301'
  telephony: string; // 'TAROM 301'
  type: string; // 'AT76'
  lat: number;
  lon: number;
  altitudeFt: number;
  headingDeg: number; // 0-359
  speedKt: number;
  verticalSpeedFpm: number;
  turnRateDegS: number; // + right, - left
  target: Targets; // what the simulator converges towards
  activeClearanceId?: string;
  lastContactAt: string; // last ATC or pilot transmission with this aircraft (simulation time)
  commsAgeS: number; // computed by the backend every tick
  /** Own navigation: the flight-plan fix the aircraft flies to (absent while on vectors). */
  nextWaypoint?: string;
  /** Orbiting at the end of its route, waiting for vectors or an approach clearance. */
  holding?: boolean;
}

export interface Targets {
  altitudeFt?: number;
  /** Assigned heading (vectors). Absent: the aircraft navigates its flight plan. */
  headingDeg?: number;
  turnDir?: TurnDir;
  speedKt?: number;
  approach?: { type: 'ILS'; runway: '09' | '27' };
  /** "Proceed direct <fix>": back to own navigation from that fix. */
  directTo?: string;
}

/** A named point on the scope (reporting point / approach fix). */
export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
}

/** The plan the aircraft filed. */
export interface FlightPlan {
  departure: string; // ICAO, e.g. 'LRTR'
  destination: string; // 'LRCV'
  /** Fixes inside the sector, in order; the last one is the initial approach fix. */
  route: Waypoint[];
  cruiseLevel: number; // flight level, e.g. 240
  declaredLandingWeightKg: number;
}

export interface Clearance {
  id: string;
  callsign: string;
  speaker: 'atc' | 'pilot';
  altitude?: { valueFt: number; action: 'climb' | 'descend' | 'maintain'; flightLevel: boolean };
  heading?: { valueDeg: number; turn: TurnDir };
  speed?: { valueKt: number };
  approach?: { type: 'ILS'; runway: string };
  frequency?: { mhz: string };
  direct?: { fix: string };
  rawText: string;
  confidence: number; // 0-1
  parsePath: 'rules' | 'llm';
}

export type AlertType =
  | 'HEARBACK_MISMATCH'
  | 'READBACK_INCOMPLETE'
  | 'WRONG_TURN'
  | 'LEVEL_BUST'
  | 'WRONG_VERTICAL'
  | 'NO_RESPONSE'
  | 'NO_CONTACT'
  | 'CONFLICT_PREDICTED';

export interface Alert {
  id: string;
  type: AlertType;
  severity: 'caution' | 'warning'; // amber / red
  callsigns: string[];
  message: string; // 'ROT301 cleared 3000 ft, read back 5000 ft'
  details: Record<string, unknown>;
  raisedAt: string;
  acknowledgedAt?: string;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** 'full' when OPENAI_API_KEY is set; 'no-keys' runs on text input and the TTS cache. */
export type AppMode = 'full' | 'no-keys';
