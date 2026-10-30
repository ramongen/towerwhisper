import { join } from 'node:path';

export const STT_MODEL = 'whisper-1';
export const STT_TIMEOUT_MS = 15_000;
/** Local Whisper: the first request after start-up may wait for the model to load. */
export const LOCAL_STT_TIMEOUT_MS = 30_000;

export const TTS_MODEL = 'tts-1';
export const TTS_TIMEOUT_MS = 10_000;
/** Each aircraft always gets the same pilot voice. */
export const TTS_VOICES = ['onyx', 'echo', 'nova', 'fable', 'alloy', 'shimmer'] as const;

/** PTT recordings shorter than this are discarded. */
export const PTT_MIN_DURATION_MS = 300;

/** Pre-generated pilot audio for the scripted demo phrases (no-keys mode), shipped in the image. */
export const TTS_CACHE_DIR = join(__dirname, '..', '..', 'assets', 'tts-cache');

/** Recorded PTT audio and generated pilot audio (a Docker volume at /app/data/audio). */
export const AUDIO_DIR = process.env.AUDIO_DIR ?? join(process.cwd(), 'data', 'audio');

/** Public URL prefix for audio files (served by AudioController). */
export const AUDIO_URL_PREFIX = '/api/audio/';
