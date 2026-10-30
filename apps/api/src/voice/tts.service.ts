import { Injectable } from '@nestjs/common';

/** Pilot voice via OpenAI TTS (MP3), or a cached file from assets/tts-cache. */
@Injectable()
export class TtsService {
  /** Returns a URL for the pilot audio, or null when only text can be shown. */
  synthesize(_text: string): Promise<string | null> {
    return Promise.resolve(null);
  }
}
