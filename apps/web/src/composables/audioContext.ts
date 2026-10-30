let context: AudioContext | null = null;

/**
 * One shared AudioContext. Browsers start it suspended until a user gesture; the first
 * key press or click on the page resumes it (see unlockAudioOnGesture).
 */
export function audioContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

export function unlockAudioOnGesture(): void {
  const unlock = () => {
    void audioContext().resume();
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);
}

/** A buffer of white noise, for radio hiss and squelch clicks. */
export function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
