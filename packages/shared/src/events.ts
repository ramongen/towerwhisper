// WebSocket events (namespace /live) and REST bodies — spec section 8.
import type { FaultConfig } from './faults';
import type { Aircraft, Alert, AppMode, Clearance, LatLon } from './types';

// ---------------------------------------------------------------------------
// WebSocket: server -> client
// ---------------------------------------------------------------------------

export const SOCKET_NAMESPACE = '/live';

export const ServerEvent = {
  TrafficUpdate: 'traffic:update',
  CommsTransmission: 'comms:transmission',
  CommsReadback: 'comms:readback',
  ClearanceIssued: 'clearance:issued',
  AlertRaised: 'alert:raised',
  AlertCleared: 'alert:cleared',
  ProbeResult: 'probe:result',
  DemoFaults: 'demo:faults',
} as const;

export type ReadbackCheck = 'ok' | 'mismatch' | 'incomplete';

/** comms:transmission — after every PTT. `clearance` is null when the phrase could not be parsed. */
export interface CommsTransmissionPayload {
  id: string;
  speaker: 'atc';
  transcript: string;
  clearance: Clearance | null;
}

/** comms:readback — after every readback. `audioUrl` is null when no audio exists (text only). */
export interface CommsReadbackPayload {
  id: string;
  speaker: 'pilot';
  callsign: string;
  transcript: string;
  clearance: Clearance | null;
  audioUrl: string | null;
  check: ReadbackCheck;
}

export interface AlertClearedPayload {
  id: string;
  reason: string;
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

export interface ServerToClientEvents {
  'traffic:update': (aircraft: Aircraft[]) => void;
  'comms:transmission': (payload: CommsTransmissionPayload) => void;
  'comms:readback': (payload: CommsReadbackPayload) => void;
  'clearance:issued': (clearance: Clearance) => void;
  'alert:raised': (alert: Alert) => void;
  'alert:cleared': (payload: AlertClearedPayload) => void;
  'probe:result': (payload: ProbeResultPayload) => void;
  'demo:faults': (config: FaultConfig) => void;
}

// ---------------------------------------------------------------------------
// WebSocket: client -> server (only to show "frequency busy" on every screen;
// audio itself goes over REST)
// ---------------------------------------------------------------------------

export const ClientEvent = {
  PttStart: 'ptt:start',
  PttEnd: 'ptt:end',
} as const;

export interface ClientToServerEvents {
  'ptt:start': () => void;
  'ptt:end': () => void;
}

// ---------------------------------------------------------------------------
// REST (prefix /api)
// ---------------------------------------------------------------------------

/** GET /health */
export interface HealthResponse {
  status: 'ok';
  mode: AppMode;
}

/** POST /sessions */
export interface CreateSessionRequest {
  scenario: 'craiova-arrivals';
}
export interface CreateSessionResponse {
  sessionId: string;
}

/** POST /sessions/:id/reset — restarts the scenario from zero */
export interface ResetSessionResponse {
  sessionId: string;
}

/** POST /transmissions — multipart form fields (the `audio` part is a webm/opus file) */
export interface TransmissionUploadFields {
  sessionId: string;
  selectedCallsign?: string;
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
  'conflict' | 'stepped-on' | 'no-response' | 'age-comms' | 'reset-comms';

/** POST /demo/triggers/age-comms */
export interface AgeCommsRequest {
  callsign: string;
  ageS: number;
}

/** POST /demo/triggers/reset-comms */
export interface ResetCommsRequest {
  callsign: string;
}

/** POST /alerts/:id/ack */
export interface AckAlertResponse {
  id: string;
  acknowledgedAt: string;
}

/** GET /sessions/:id/stats */
export interface SessionStats {
  faultsInjected: number;
  faultsDetected: number;
  meanDetectionS: number | null;
  meanSttLatencyMs: number | null;
}
