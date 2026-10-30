import { ref } from 'vue';
import { audioContext } from './audioContext';

/** Minimum PTT recording length; shorter presses are discarded. */
export const PTT_MIN_DURATION_MS = 300;
/** Bars in the PTT VU meter. */
export const VU_BANDS = 20;

export interface Recording {
  blob: Blob;
  durationMs: number;
}

let stream: MediaStream | null = null;

/**
 * PTT capture with MediaRecorder: start on Space down, the blob on release. Also feeds the
 * VU meter from an AnalyserNode. getUserMedia needs localhost or HTTPS.
 */
export function useMicrophone() {
  const bands = ref<number[]>(Array(VU_BANDS).fill(0));
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let meterFrame = 0;
  let analyser: AnalyserNode | null = null;

  async function start(): Promise<void> {
    stream ??= await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.start();
    startedAt = performance.now();
    startMeter(stream);
  }

  function stop(): Promise<Recording | null> {
    stopMeter();
    const active = recorder;
    recorder = null;
    if (!active || active.state === 'inactive') return Promise.resolve(null);
    const durationMs = performance.now() - startedAt;
    return new Promise((resolve) => {
      active.onstop = () => {
        if (durationMs < PTT_MIN_DURATION_MS) return resolve(null);
        resolve({ blob: new Blob(chunks, { type: active.mimeType || 'audio/webm' }), durationMs });
      };
      active.stop();
    });
  }

  function startMeter(source: MediaStream): void {
    const ctx = audioContext();
    void ctx.resume();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(source).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      if (!analyser) return;
      analyser.getByteFrequencyData(data);
      // Voice lives in the lower bins; spread them over the bars.
      const perBand = Math.floor((data.length * 0.6) / VU_BANDS);
      bands.value = Array.from({ length: VU_BANDS }, (_, i) => {
        let sum = 0;
        for (let j = 0; j < perBand; j++) sum += data[i * perBand + j];
        return Math.min(1, sum / perBand / 180);
      });
      meterFrame = requestAnimationFrame(loop);
    };
    loop();
  }

  function stopMeter(): void {
    cancelAnimationFrame(meterFrame);
    analyser?.disconnect();
    analyser = null;
    bands.value = Array(VU_BANDS).fill(0);
  }

  return { start, stop, bands };
}
