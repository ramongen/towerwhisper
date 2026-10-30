import type { Alert } from '@towerwhisper/shared';
import { audioContext } from './audioContext';

/** Two descending tones for a warning (red), one tone for a caution (amber). */
const TONES: Record<Alert['severity'], number[]> = {
  warning: [880, 660],
  caution: [660],
};
const TONE_S = 0.16;
const GAP_S = 0.06;
const VOLUME = 0.12;

export function playAlertSound(severity: Alert['severity']): void {
  const ctx = audioContext();
  if (ctx.state !== 'running') return; // no user gesture yet
  let at = ctx.currentTime;
  for (const freq of TONES[severity]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(VOLUME, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + TONE_S);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + TONE_S);
    at += TONE_S + GAP_S;
  }
}
