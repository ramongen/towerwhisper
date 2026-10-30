import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModeService } from '../app-mode.service';
import {
  AUDIO_DIR,
  AUDIO_URL_PREFIX,
  TTS_CACHE_DIR,
  TTS_MODEL,
  TTS_TIMEOUT_MS,
  TTS_VOICES,
} from './constants';

/**
 * Pilot voice. Looks in assets/tts-cache first (the scripted demo phrases, works without
 * keys), then in the generated-audio folder, then asks OpenAI TTS for an MP3.
 * Returns null when only text can be shown; never throws.
 */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    private readonly appMode: AppModeService,
  ) {
    this.apiKey = config.get<string>('OPENAI_API_KEY')?.trim();
  }

  async synthesize(text: string, callsign: string): Promise<string | null> {
    const voice = voiceFor(callsign);
    const file = cacheFileName(text, voice);
    if (existsSync(join(TTS_CACHE_DIR, file)) || existsSync(join(AUDIO_DIR, file))) {
      return AUDIO_URL_PREFIX + file;
    }
    if (!this.appMode.hasOpenAiKey || !this.apiKey) return null;

    try {
      const mp3 = await generateSpeech(this.apiKey, text, voice);
      await mkdir(AUDIO_DIR, { recursive: true });
      await writeFile(join(AUDIO_DIR, file), mp3);
      return AUDIO_URL_PREFIX + file;
    } catch (error) {
      this.logger.warn(`TTS failed: ${(error as Error).message}`);
      return null;
    }
  }
}

/** OpenAI TTS call, shared with the cache-generation script. */
export async function generateSpeech(apiKey: string, text: string, voice: string): Promise<Buffer> {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice,
      input: text,
      response_format: 'mp3',
      speed: 1.1,
    }),
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export function voiceFor(callsign: string): string {
  let hash = 0;
  for (const ch of callsign) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TTS_VOICES[hash % TTS_VOICES.length];
}

/** Same text + voice -> same file name, so cached audio is found again. */
export function cacheFileName(text: string, voice: string): string {
  const key = `${voice}|${text.trim().toLowerCase()}`;
  return `${createHash('sha1').update(key).digest('hex').slice(0, 20)}.mp3`;
}
