/** Minimum PTT recording length; shorter presses are discarded. */
export const PTT_MIN_DURATION_MS = 300;

/**
 * PTT capture with MediaRecorder: start on Space down, send the blob on release.
 * SKELETON: not implemented yet.
 */
export function useMicrophone() {
  function start(): Promise<void> {
    return Promise.reject(new Error('useMicrophone.start not implemented'));
  }

  function stop(): Promise<Blob | null> {
    return Promise.reject(new Error('useMicrophone.stop not implemented'));
  }

  return { start, stop };
}
