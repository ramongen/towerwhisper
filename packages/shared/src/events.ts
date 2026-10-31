// WebSocket events (namespace /live) and REST bodies — spec section 8.
import type { FaultConfig } from './faults';
import type {
  Aircraft,
  AirportWeather,
  Alert,
  AlertOutcome,
  AppMode,
  Clearance,
  AlertType,
  LatLon,
  PresenceUser,
  SectorInfo,
  SttProvider,
  User,
  UserRole,
} from './types';

// ---------------------------------------------------------------------------
// WebSocket: server -> client
// ---------------------------------------------------------------------------

export const SOCKET_NAMESPACE = '/live';

export const ServerEvent = {
  TrafficUpdate: 'traffic:update',
  CommsTransmission: 'comms:transmission',
  CommsReadback: 'comms:readback',
  CommsHistory: 'comms:history',
  ClearanceIssued: 'clearance:issued',
  AlertRaised: 'alert:raised',
  AlertCleared: 'alert:cleared',
  AlertHistory: 'alert:history',
  ProbeResult: 'probe:result',
  DemoFaults: 'demo:faults',
  FrequencyBusy: 'frequency:busy',
  SessionReset: 'session:reset',
  StatsOverlay: 'stats:overlay',
  WeatherUpdate: 'weather:update',
  SectorJoined: 'sector:joined',
  SupervisorOverview: 'supervisor:overview',
} as const;

export type ReadbackCheck = 'ok' | 'mismatch' | 'incomplete';

/** comms:transmission — after every PTT. `clearance` is null when the phrase could not be parsed. */
export interface CommsTransmissionPayload {
  id: string;
  /** Server time of the transmission (ISO). */
  at: string;
  speaker: 'atc';
  transcript: string;
  clearance: Clearance | null;
  /** Recorded PTT audio (absent or null for typed transmissions). */
  audioUrl?: string | null;
  /** Name of the controller who transmitted. */
  by?: string | null;
}

/**
 * comms:readback — every pilot transmission: readbacks, and calls the pilot starts (a landing
 * request, a go-around), which have check null. `audioUrl` is null when no audio exists.
 */
export interface CommsReadbackPayload {
  id: string;
  /** Server time of the readback (ISO). */
  at: string;
  speaker: 'pilot';
  callsign: string;
  transcript: string;
  clearance: Clearance | null;
  audioUrl: string | null;
  check: ReadbackCheck | null;
}

/** alert:cleared — the alert ended; the screens move it to the history. */
export interface AlertClearedPayload {
  id: string;
  reason: string;
  outcome: AlertOutcome;
  at: string;
}

/** One predicted loss of separation found by the Clearance Probe (bonus). */
export interface ProbeConflict {
  callsign: string;
  tMinS: number; // seconds until closest approach
  horizontalNm: number;
  verticalFt: number;
}

export interface ProbeResultPayload {
  callsign: string;
  path: LatLon[];
  conflicts: ProbeConflict[];
}

/** frequency:busy — someone is holding PTT (relayed from ptt:start / ptt:end to every screen). */
export interface FrequencyBusyPayload {
  busy: boolean;
}

/** session:reset — the scenario restarted; screens clear comms and alerts. */
export interface SessionResetPayload {
  sessionId: string;
  startedAt: string;
}

/** stats:overlay — the demo panel shows or hides the end-of-demo results on the big screen. */
export interface StatsOverlayPayload {
  visible: boolean;
}

/** sector:joined — the socket now follows this sector's session (after connect or sector:watch). */
export interface SectorJoinedPayload {
  sector: SectorInfo;
  sessionId: string;
  startedAt: string;
  /** 'control' for the sector's ATC; 'view' for a supervisor or the demo panel. */
  access: 'control' | 'view';
}

/** One sector on the supervisor dashboard (live). */
export interface SectorOverview {
  sector: SectorInfo;
  sessionId: string;
  startedAt: string;
  aircraftCount: number;
  activeAlerts: Alert[];
  /** Controllers working the sector right now. */
  controllers: PresenceUser[];
  /** Everyone else following it (supervisors, demo panel). */
  viewers: number;
  sessionAlerts: number;
  sessionResolved: number;
  /** Mean time from raise to resolution by the controller in this session (s). */
  meanResolveS: number | null;
}

/** supervisor:overview — every sector, pushed to supervisors when alerts change and every few seconds. */
export interface SupervisorOverviewPayload {
  at: string;
  sectors: SectorOverview[];
}

export interface ServerToClientEvents {
  'traffic:update': (aircraft: Aircraft[]) => void;
  'comms:transmission': (payload: CommsTransmissionPayload) => void;
  'comms:readback': (payload: CommsReadbackPayload) => void;
  /** On connect: recent comms, oldest first. Shown, never played again. */
  'comms:history': (entries: (CommsTransmissionPayload | CommsReadbackPayload)[]) => void;
  'clearance:issued': (clearance: Clearance) => void;
  'alert:raised': (alert: Alert) => void;
  'alert:cleared': (payload: AlertClearedPayload) => void;
  /** On connect: alerts that ended in this session, oldest first (kept until a scenario reset). */
  'alert:history': (alerts: Alert[]) => void;
  'probe:result': (payload: ProbeResultPayload) => void;
  'demo:faults': (config: FaultConfig) => void;
  'frequency:busy': (payload: FrequencyBusyPayload) => void;
  'session:reset': (payload: SessionResetPayload) => void;
  'stats:overlay': (payload: StatsOverlayPayload) => void;
  /** On connect and whenever a new observation arrives. */
  'weather:update': (weather: AirportWeather) => void;
  'sector:joined': (payload: SectorJoinedPayload) => void;
  'supervisor:overview': (payload: SupervisorOverviewPayload) => void;
}

// ---------------------------------------------------------------------------
// WebSocket: client -> server (only to show "frequency busy" on every screen;
// audio itself goes over REST)
// ---------------------------------------------------------------------------

export const ClientEvent = {
  PttStart: 'ptt:start',
  PttEnd: 'ptt:end',
  RadarSelect: 'radar:select',
  SectorWatch: 'sector:watch',
} as const;

/**
 * Socket handshake (`io('/live', { auth })`): an ATC or supervisor sends its token; the demo
 * panel sends none and picks a sector with sector:watch.
 */
export interface SocketAuth {
  token?: string;
}

export interface ClientToServerEvents {
  'ptt:start': () => void;
  'ptt:end': () => void;
  /** The controller selected an aircraft; demo faults with target "selected" use it. */
  'radar:select': (callsign: string | null) => void;
  /**
   * Supervisor and demo panel: follow this sector's session read-only (null: none).
   * An ATC always follows its own sector.
   */
  'sector:watch': (sectorId: string | null) => void;
}

// ---------------------------------------------------------------------------
// REST (prefix /api)
// ---------------------------------------------------------------------------

/**
 * Requests act on one sector: an ATC's own; a supervisor or the demo panel name it in the
 * X-Sector-Id header (Craiova Approach when absent).
 */
export const SECTOR_HEADER = 'x-sector-id';

/** POST /auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  /** Bearer token for REST (Authorization header) and the socket handshake. */
  token: string;
  expiresAt: string;
  user: User;
}

/** GET /users — every account, with who is connected now (supervisor only). */
export interface UserListItem extends User {
  online: boolean;
}

/** POST /users (supervisor only) */
export interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  sectorId: string | null;
}

/** PATCH /users/:id (supervisor only); a password sets a new one. */
export interface UpdateUserRequest {
  name?: string;
  role?: UserRole;
  sectorId?: string | null;
  password?: string;
}

/** GET /demo/sessions — the live session of every sector and who is in it (demo panel). */
export interface DemoSessionInfo {
  sector: SectorInfo;
  sessionId: string;
  startedAt: string;
  users: PresenceUser[];
  aircraftCount: number;
  activeAlerts: number;
}

// --- Supervisor analytics -----------------------------------------------------------------

export type AnalyticsRange = '1h' | '24h' | '7d' | '30d';

/** GET /supervisor/analytics?range=24h&sector=all */
export interface SupervisorAnalytics {
  range: AnalyticsRange;
  sectorId: string | null; // null = every sector
  from: string;
  to: string;
  /** Width of one timeline bucket (s). */
  bucketS: number;
  totals: {
    raised: number;
    warnings: number;
    cautions: number;
    resolved: number;
    cleared: number;
    active: number;
    meanResolveS: number | null;
    medianResolveS: number | null;
    /** Alerts per hour of sector session time in the range. */
    ratePerHour: number | null;
    sessionHours: number;
    transmissions: number;
  };
  /** Alerts raised per bucket by severity, and alerts resolved by the controller. */
  timeline: { t: string; caution: number; warning: number; resolved: number }[];
  byType: { type: AlertType; count: number; resolved: number; meanResolveS: number | null }[];
  bySector: {
    sectorId: string;
    raised: number;
    resolved: number;
    cleared: number;
    meanResolveS: number | null;
    ratePerHour: number | null;
  }[];
  /** How long the controller took to resolve. */
  resolveHistogram: { label: string; count: number }[];
  /** Controllers active in the range: what they transmitted and resolved. */
  controllers: {
    userId: string;
    name: string;
    sectorId: string | null;
    transmissions: number;
    resolved: number;
    meanResolveS: number | null;
  }[];
  /** Latest alerts in the range, newest first. */
  recent: AlertRecord[];
}

/** A past (or active) alert with where it happened, so it can be replayed. */
export interface AlertRecord extends Alert {
  sectorId: string;
  sessionId: string;
  /** Name of the controller who resolved it. */
  resolvedBy: string | null;
}

export type AlertOutcomeFilter = AlertOutcome | 'open';

/**
 * GET /supervisor/alerts?sector=&type=&severity=&outcome=&since=&q=&page=&pageSize=
 * Every alert ever raised, newest first.
 */
export interface AlertSearchResponse {
  total: number;
  page: number;
  pageSize: number;
  items: AlertRecord[];
}

// --- Replay -------------------------------------------------------------------------------

/** GET /replay/sessions?sector=craiova-app — recorded sessions, newest first. */
export interface ReplaySessionSummary {
  id: string;
  sectorId: string;
  startedAt: string;
  /** null while the session is still live. */
  endedAt: string | null;
  durationS: number;
  alerts: number;
  transmissions: number;
  live: boolean;
  /** Radar frames were recorded (sessions from before the replay have comms and alerts only). */
  hasRadar: boolean;
}

/** One recorded radar picture. */
export interface ReplayFrame {
  /** Epoch ms. */
  t: number;
  aircraft: Aircraft[];
}

/** GET /replay/sessions/:id — everything needed to scrub through a session. */
export interface ReplaySession {
  session: ReplaySessionSummary;
  sector: SectorInfo;
  /** The span the timeline covers (epoch ms): the session, or its recorded part. */
  from: number;
  to: number;
  frames: ReplayFrame[];
  /** ATC transmissions (with PTT audio when spoken) and pilot calls, oldest first. */
  comms: (CommsTransmissionPayload | CommsReadbackPayload)[];
  /** Every alert raised in the session, with its end when it ended. */
  alerts: Alert[];
}

/** GET /health */
export interface HealthResponse {
  status: 'ok';
  mode: AppMode;
  stt: SttProvider;
}

/** POST /sessions */
export interface CreateSessionRequest {
  scenario: 'craiova-arrivals';
}
export interface CreateSessionResponse {
  sessionId: string;
}

/** GET /sessions/current — the session every screen joins */
export interface CurrentSessionResponse {
  sessionId: string;
  startedAt: string;
  mode: AppMode;
  stt: SttProvider;
  /** Scripted demo phrases, offered as text input in no-keys mode. */
  scriptedPhrases: string[];
}

/** POST /sessions/:id/reset — restarts the scenario from zero */
export interface ResetSessionResponse {
  sessionId: string;
}

/** POST /transmissions — multipart form fields (the `audio` part is a webm/opus file) */
export interface TransmissionUploadFields {
  sessionId: string;
  selectedCallsign?: string;
  /** PTT hold time; recordings under 300 ms are discarded. */
  durationMs?: string;
}

/** POST /transmissions/text — for tests and as a fallback when the microphone fails */
export interface TextTransmissionRequest {
  text: string;
  sessionId?: string;
  selectedCallsign?: string;
}

/** Response of both POST /transmissions and POST /transmissions/text */
export interface TransmissionResponse {
  transmissionId: string;
  transcript: string;
  clearance: Clearance | null;
}

/** GET /demo/faults -> FaultConfig; PUT /demo/faults with a FaultConfig body -> FaultConfig */
export type GetFaultsResponse = FaultConfig;
export type PutFaultsRequest = FaultConfig;
export type PutFaultsResponse = FaultConfig;

/** POST /demo/triggers/:name */
export type DemoTriggerName =
  'conflict' | 'stepped-on' | 'no-response' | 'age-comms' | 'reset-comms' | 'stats-overlay';

/** POST /demo/triggers/stats-overlay */
export interface StatsOverlayRequest {
  visible: boolean;
}

/** POST /demo/triggers/age-comms — without a callsign, the demo-panel target is used. */
export interface AgeCommsRequest {
  callsign?: string;
  ageS: number;
}

/** POST /demo/triggers/reset-comms — without a callsign, the demo-panel target is used. */
export interface ResetCommsRequest {
  callsign?: string;
}

/** POST /demo/triggers/conflict and the other triggers answer with what they did. */
export interface DemoTriggerResponse {
  ok: boolean;
  callsign?: string;
  message: string;
}

/**
 * GET /weather/radar — latest precipitation radar frame (RainViewer composite) for the scope.
 * Tiles are served through the API at tileUrl (with {x} and {y}), Web Mercator, zoom `zoom`.
 */
export interface WeatherRadarResponse {
  available: boolean;
  time: string | null;
  zoom: number;
  tileUrl: string;
  /** Tile index range covering the scope area. */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** GET /weather -> AirportWeather, or 204 when no source answered yet. */
export type WeatherResponse = AirportWeather;

/** POST /alerts/:id/resolve — the controller marks an active alert as resolved. */
export interface ResolveAlertResponse {
  id: string;
  resolvedAt: string;
}

/** GET /sessions/:id/stats */
export interface SessionStats {
  faultsInjected: number;
  faultsDetected: number;
  meanDetectionS: number | null;
  meanSttLatencyMs: number | null;
  /** Share of test/phrases.json fields the rule parser gets right (0-1), measured at startup. */
  parserAccuracy: number | null;
}
