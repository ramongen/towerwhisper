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
  approach?: { type: ApproachType; runway: RunwayId };
  /** "Proceed direct <fix>": back to own navigation from that fix. */
  directTo?: string;
  /** "Cleared to land": the aircraft lands at the end of its approach instead of going around. */
  landingCleared?: boolean;
}

/** A named point on the scope (reporting point / approach fix). */
export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
}

/** A published significant point, with its role in the LRCV approach when it has one. */
export interface AirspaceFix extends Waypoint {
  role?: 'IAF' | 'IF';
  routes?: string;
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
  approach?: { type: ApproachType; runway: string };
  frequency?: { mhz: string };
  direct?: { fix: string };
  /** "Cleared to land runway 26" (runway null when it was not said). */
  landing?: { runway: string | null };
  /** "Go around" / "going around". */
  goAround?: boolean;
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
  /** Set when the alert ended: resolved by the controller, or cleared because the condition went away. */
  endedAt?: string;
  outcome?: AlertOutcome;
  endReason?: string;
}

export type AlertOutcome = 'resolved' | 'cleared';

export interface LatLon {
  lat: number;
  lon: number;
}

/** LRCV runway 08/26 (AIP Romania AD 2 LRCV); the ILS serves runway 26 only. */
export type RunwayId = '08' | '26';
export type ApproachType = 'ILS' | 'RNP' | 'VOR';
export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR';

/** Wind along one runway direction (negative headwind = tailwind). */
export interface RunwayWind {
  runway: RunwayId;
  headwindKt: number;
  crosswindKt: number;
}

/** Current weather at the airport, decoded for the controller (METAR, or model data as fallback). */
export interface AirportWeather {
  icao: string;
  source: 'metar' | 'model';
  observedAt: string;
  raw: string | null;
  windDirDeg: number | null; // null = variable
  windSpeedKt: number;
  windGustKt: number | null;
  visibilityM: number | null;
  clouds: { cover: string; baseFt: number }[];
  ceilingFt: number | null; // lowest BKN/OVC layer
  temperatureC: number | null;
  dewpointC: number | null;
  qnhHpa: number | null;
  weather: string | null; // present weather, e.g. '-RA BR'
  flightCategory: FlightCategory | null;
  runwayWind: RunwayWind[];
  /** Runway direction with the most headwind (09 when calm: it has the ILS). */
  preferredRunway: RunwayId;
  /** Precipitation reported: the runway is treated as wet for landing distances. */
  wetRunway: boolean;
  fetchedAt: string;
}

/** Published (approximate) data of an aircraft type, for planning advice only. */
export interface AircraftTypeInfo {
  icao: string; // 'B738'
  model: string; // 'Boeing 737-800'
  wakeCategory: 'L' | 'M' | 'H';
  aerodromeCode: string; // ICAO aerodrome reference code, e.g. '4C'
  mtowKg: number;
  mlwKg: number;
  wingspanM: number;
  /** Certified landing field length at MLW, dry, sea level. */
  landingFieldLengthM: number;
  maxCrosswindKt: number; // demonstrated
  /** Typical final approach speed (Vapp) at a normal landing weight. */
  approachSpeedKt: number;
  minRunwayWidthM: number;
}

/** Can this aircraft land on one runway direction of our airport right now? */
export interface RunwayAssessment {
  runway: RunwayId;
  compatible: boolean;
  /** The compatible direction with the most headwind. */
  recommended: boolean;
  requiredLandingM: number;
  availableM: number;
  headwindKt: number | null; // null without live wind
  crosswindKt: number | null;
  /** Why it is (not) compatible, in plain words. */
  notes: string[];
}

/** GET /aircraft/:callsign — everything the aircraft popup shows. */
export interface AircraftDetails {
  callsign: string;
  telephony: string;
  type: AircraftTypeInfo | null;
  flightPlan: FlightPlan | null;
  /** Fixes still ahead on its own navigation (empty on vectors). */
  remainingRoute: Waypoint[];
  runways: RunwayAssessment[];
  /** 'live' when the runway advice includes the current wind and runway state. */
  weatherBasis: 'live' | 'none';
}

/** GET /airspace — static map data for the scope. */
export interface AirspaceResponse {
  airport: { icao: string; name: string; lat: number; lon: number; elevationFt: number };
  runways: {
    id: RunwayId;
    /** True bearing of the runway direction. */
    headingDeg: number;
    threshold: LatLon;
    lengthM: number;
    widthM: number;
    ils: { ident: string; frequencyMhz: string } | null;
  }[];
  navaids: { ident: string; type: string; frequencyMhz: string; lat: number; lon: number }[];
  fixes: AirspaceFix[];
  /** Where the data comes from (AIP edition). */
  source: string;
}

/** 'full' when speech-to-text is available (local Whisper or OpenAI); 'no-keys' runs on text input. */
export type AppMode = 'full' | 'no-keys';

/** Who turns PTT audio into text: Whisper on our own GPU, the OpenAI API, or nobody (typed). */
export type SttProvider = 'local-whisper' | 'openai' | 'none';
