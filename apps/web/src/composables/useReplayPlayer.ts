import type { Aircraft, Alert, ReplaySession } from '@towerwhisper/shared';
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { useAlertStore } from '../stores/useAlertStore';
import { useCommsStore } from '../stores/useCommsStore';
import { useTrafficStore } from '../stores/useTrafficStore';
import { useRadioVoice } from './useRadioVoice';

/** The radar gets a new picture this often while playing, as from the live server (4 Hz). */
const PUSH_MS = 250;
/** Voices only make sense up to this speed; faster, the replay is silent. */
export const MAX_VOICE_SPEED = 2;
export const SPEEDS = [1, 2, 4, 8, 16] as const;
const VOICE_NOISE = 0.25;

/**
 * Plays a recorded session back through the same stores the live screens use: the radar
 * picture interpolated between recorded frames, the comms up to the cursor, the alerts that
 * were active at that moment. Pilot readbacks and the controller's PTT recordings are played
 * as the cursor passes them (at 1x and 2x).
 */
export function useReplayPlayer() {
  const traffic = useTrafficStore();
  const comms = useCommsStore();
  const alerts = useAlertStore();
  const voice = useRadioVoice();

  const session = shallowRef<ReplaySession | null>(null);
  const t = ref(0);
  const playing = ref(false);
  const speed = ref<(typeof SPEEDS)[number]>(1);
  const voices = ref(true);

  const start = computed(() => session.value?.frames[0]?.t ?? 0);
  const end = computed(() => session.value?.frames.at(-1)?.t ?? 0);
  const voiceActive = computed(() => voices.value && speed.value <= MAX_VOICE_SPEED);

  let frame = 0;
  let lastWall = 0;
  let lastPush = 0;
  /** comms entries already on screen (index into session.comms). */
  let shownComms = 0;
  let alertSignature = '';
  const commsTimes: number[] = [];

  function load(next: ReplaySession): void {
    pause();
    session.value = next;
    commsTimes.length = 0;
    for (const c of next.comms) commsTimes.push(Date.parse(c.at));
    seek(next.frames[0]?.t ?? 0);
  }

  function unload(): void {
    pause();
    session.value = null;
    traffic.reset();
    traffic.setAircraft([]);
    comms.clear();
    alerts.clearAll();
  }

  function play(): void {
    if (!session.value || playing.value) return;
    if (t.value >= end.value) seek(start.value);
    playing.value = true;
    lastWall = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause(): void {
    playing.value = false;
    cancelAnimationFrame(frame);
  }

  function toggle(): void {
    if (playing.value) pause();
    else play();
  }

  /** Jump to a moment: everything on screen is rebuilt for it (no voices on a jump). */
  function seek(ms: number): void {
    if (!session.value) return;
    t.value = Math.min(end.value, Math.max(start.value, ms));
    const selected = traffic.selectedCallsign;
    traffic.reset(); // no trail or interpolation across a jump
    traffic.select(selected);
    comms.clear();
    shownComms = 0;
    alertSignature = '';
    render(false);
  }

  function skip(seconds: number): void {
    seek(t.value + seconds * 1000);
  }

  function loop(now: number): void {
    if (!playing.value) return;
    const dt = now - lastWall;
    lastWall = now;
    t.value = Math.min(end.value, t.value + dt * speed.value);
    if (now - lastPush >= PUSH_MS || t.value >= end.value) {
      lastPush = now;
      render(true);
    }
    if (t.value >= end.value) {
      pause();
      return;
    }
    frame = requestAnimationFrame(loop);
  }

  /** Pushes the state at the cursor into the stores. */
  function render(speak: boolean): void {
    const s = session.value;
    if (!s) return;
    traffic.setAircraft(aircraftAt(s, t.value));

    // Comms that happened up to the cursor (only new ones are added while playing).
    while (shownComms < s.comms.length && commsTimes[shownComms] <= t.value) {
      const entry = s.comms[shownComms];
      comms.add(entry, true);
      if (speak && voiceActive.value && entry.audioUrl) {
        void voice.play(entry.audioUrl, entry.transcript, VOICE_NOISE);
      }
      shownComms++;
    }

    // Alerts active at the cursor, and those that had ended by then.
    const active: Alert[] = [];
    const ended: Alert[] = [];
    for (const a of s.alerts) {
      const raised = Date.parse(a.raisedAt);
      if (raised > t.value) continue;
      const endedAt = a.endedAt ? Date.parse(a.endedAt) : Infinity;
      if (endedAt <= t.value) ended.push(a);
      else active.push({ ...a, endedAt: undefined, outcome: undefined, endReason: undefined });
    }
    const signature = `${active.map((a) => a.id).join()}|${ended.length}`;
    if (signature !== alertSignature) {
      alertSignature = signature;
      alerts.clearAll();
      alerts.setHistory(ended);
      for (const a of active.reverse()) alerts.raise(a);
    }
  }

  onBeforeUnmount(() => cancelAnimationFrame(frame));

  return {
    session,
    t,
    start,
    end,
    playing,
    speed,
    voices,
    voiceActive,
    load,
    unload,
    play,
    pause,
    toggle,
    seek,
    skip,
  };
}

/** The radar picture at a moment, interpolated between the two recorded frames around it. */
function aircraftAt(s: ReplaySession, t: number): Aircraft[] {
  const frames = s.frames;
  if (!frames.length) return [];
  let lo = 0;
  let hi = frames.length - 1;
  if (t <= frames[0].t) return frames[0].aircraft;
  if (t >= frames[hi].t) return frames[hi].aircraft;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const k = (t - a.t) / Math.max(1, b.t - a.t);
  const next = new Map(b.aircraft.map((x) => [x.callsign, x]));
  const out: Aircraft[] = [];
  for (const from of a.aircraft) {
    const to = next.get(from.callsign);
    if (!to) {
      if (k < 0.5) out.push(from); // left the scope (landed) in between
      continue;
    }
    out.push({
      ...(k < 0.5 ? from : to),
      lat: from.lat + (to.lat - from.lat) * k,
      lon: from.lon + (to.lon - from.lon) * k,
      altitudeFt: Math.round(from.altitudeFt + (to.altitudeFt - from.altitudeFt) * k),
      headingDeg: Math.round(lerpHeading(from.headingDeg, to.headingDeg, k)),
      speedKt: Math.round(from.speedKt + (to.speedKt - from.speedKt) * k),
      commsAgeS: Math.round(from.commsAgeS + (to.commsAgeS - from.commsAgeS) * k),
    });
  }
  for (const to of b.aircraft) {
    if (k >= 0.5 && !a.aircraft.some((x) => x.callsign === to.callsign)) out.push(to); // appeared
  }
  return out;
}

function lerpHeading(from: number, to: number, k: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return (((from + d * k) % 360) + 360) % 360;
}
