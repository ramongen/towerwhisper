import { audioContext, noiseBuffer } from './audioContext';

/** VHF voice band. */
const HIGHPASS_HZ = 300;
const LOWPASS_HZ = 3000;
const DISTORTION = 12;
/** Hiss gain at radioNoise = 1. */
const MAX_NOISE_GAIN = 0.35;
const SQUELCH_S = 0.07;
const SQUELCH_GAIN = 0.4;

/** Browser-voice pitch per speaker, so a typed controller call does not sound like the pilot. */
const SPEECH_PITCH = { pilot: 1, atc: 0.8 } as const;

export type RadioSpeaker = keyof typeof SPEECH_PITCH;

let queue: Promise<void> = Promise.resolve();
const decoded = new Map<string, AudioBuffer>();

/**
 * Plays radio audio through Web Audio: band-pass ~300-3000 Hz, light distortion, hiss at
 * the demo-panel noise level, squelch clicks at both ends. Transmissions never overlap:
 * each waits for the previous one. Without audio, speechSynthesis is the offline fallback
 * (it cannot go through the filter, so the hiss plays alongside it); the controller then
 * gets a different voice from the pilot's.
 */
export function useRadioVoice() {
  function play(
    audioUrl: string | null,
    text: string,
    noise: number,
    speaker: RadioSpeaker = 'pilot',
  ): Promise<void> {
    queue = queue
      .then(() => (audioUrl ? playFile(audioUrl, noise) : speak(text, noise, speaker)))
      .catch((error: Error) => console.warn('Radio audio failed:', error.message));
    return queue;
  }

  return { play };
}

async function playFile(url: string, noise: number): Promise<void> {
  const ctx = audioContext();
  let buffer = decoded.get(url);
  if (!buffer) {
    const response = await fetch(url);
    buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    decoded.set(url, buffer);
  }

  const voice = ctx.createBufferSource();
  voice.buffer = buffer;
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = HIGHPASS_HZ;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = LOWPASS_HZ;
  const shaper = ctx.createWaveShaper();
  shaper.curve = distortionCurve(DISTORTION);
  voice.connect(highpass).connect(lowpass).connect(shaper).connect(ctx.destination);

  const start = ctx.currentTime + SQUELCH_S;
  const end = start + buffer.duration;
  const hiss = startHiss(ctx, noise, ctx.currentTime, end + SQUELCH_S);
  squelch(ctx, ctx.currentTime);
  squelch(ctx, end);
  voice.start(start);
  await new Promise<void>((resolve) => (voice.onended = () => resolve()));
  hiss.stop(end + SQUELCH_S);
  await wait(SQUELCH_S * 1000);
}

/** Offline fallback: browser speech plus radio hiss. */
async function speak(text: string, noise: number, speaker: RadioSpeaker): Promise<void> {
  if (!('speechSynthesis' in window) || !text.trim()) return;
  const ctx = audioContext();
  squelch(ctx, ctx.currentTime);
  const hiss = startHiss(ctx, noise, ctx.currentTime, ctx.currentTime + 30);
  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.1;
    utterance.pitch = SPEECH_PITCH[speaker];
    if (speaker === 'atc') {
      const voice = controllerVoice();
      if (voice) utterance.voice = voice;
    }
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
  hiss.stop();
  squelch(ctx, ctx.currentTime);
}

/** An English voice other than the default one (which the pilot uses), when there is one. */
function controllerVoice(): SpeechSynthesisVoice | undefined {
  return speechSynthesis.getVoices().find((v) => v.lang.startsWith('en') && !v.default);
}

function startHiss(
  ctx: AudioContext,
  noise: number,
  from: number,
  until: number,
): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, 2);
  source.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1500;
  band.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, noise)) * MAX_NOISE_GAIN;
  source.connect(band).connect(gain).connect(ctx.destination);
  source.start(from);
  source.stop(until);
  return source;
}

/** The short burst of noise when a carrier opens or closes. */
function squelch(ctx: AudioContext, at: number): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, SQUELCH_S);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(SQUELCH_GAIN, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + SQUELCH_S);
  source.connect(gain).connect(ctx.destination);
  source.start(at);
}

function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
