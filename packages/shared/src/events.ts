// WebSocket events (namespace /live) and REST bodies — spec section 8.
import type { FaultConfig } from './faults';
import type {
  Aircraft,
  AirportWeather,
  Alert,
  AlertOutcome,
  AppMode,
  Clearance,
  LatLon,
  SttProvider,
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
}

// ---------------------------------------------------------------------------
// WebSocket: client -> server (only to show "frequency busy" on every screen;
// audio itself goes over REST)
// ---------------------------------------------------------------------------

export const ClientEvent = {
  PttStart: 'ptt:start',
  PttEnd: 'ptt:end',
  RadarSelect: 'radar:select',
} as const;

export interface ClientToServerEvents {
  'ptt:start': () => void;
  'ptt:end': () => void;
  /** The controller selected an aircraft; demo faults with target "selected" use it. */
  'radar:select': (callsign: string | null) => void;
}

// ---------------------------------------------------------------------------
// REST (prefix /api)
// ---------------------------------------------------------------------------

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
