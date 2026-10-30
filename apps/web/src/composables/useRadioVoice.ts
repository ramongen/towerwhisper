/**
 * Plays pilot audio through Web Audio: band-pass ~300-3000 Hz, light distortion,
 * noise at the demo-panel level, squelch clicks. SKELETON: not implemented yet.
 */
export function useRadioVoice() {
  function play(_audioUrl: string): Promise<void> {
    return Promise.reject(new Error('useRadioVoice.play not implemented'));
  }

  return { play };
}
