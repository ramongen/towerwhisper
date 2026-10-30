import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SttProvider } from '@towerwhisper/shared';
import { AppModeService } from '../app-mode.service';
import { LOCAL_STT_TIMEOUT_MS, STT_MODEL, STT_TIMEOUT_MS } from './constants';

export interface SttResult {
  text: string;
  latencyMs: number;
  provider: SttProvider;
}

/**
 * Speech-to-text. Local Whisper (large-v3 on our GPU) first when WHISPER_URL is set, the
 * OpenAI Whisper API as fallback when a key is set. The prompt carries the session
 * callsigns, fixes and ATC vocabulary. Returns null when nothing could transcribe.
 */
@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    private readonly appMode: AppModeService,
  ) {
    this.apiKey = config.get<string>('OPENAI_API_KEY')?.trim();
  }

  /** Never throws. */
  async transcribe(
    audio: Buffer,
    mimeType: string,
    vocabularyPrompt: string,
  ): Promise<SttResult | null> {
    if (this.appMode.whisperUrl) {
      const local = await this.local(this.appMode.whisperUrl, audio, mimeType, vocabularyPrompt);
      if (local) return local;
    }
    if (this.appMode.hasOpenAiKey && this.apiKey) {
      return this.openAi(this.apiKey, audio, mimeType, vocabularyPrompt);
    }
    return null;
  }

  /** whisper-asr-webservice (faster-whisper): POST /asr, plain-text answer. */
  private async local(
    baseUrl: string,
    audio: Buffer,
    mimeType: string,
    prompt: string,
  ): Promise<SttResult | null> {
    const started = Date.now();
    try {
      const form = new FormData();
      form.append('audio_file', new Blob([audio], { type: mimeType }), fileName(mimeType));
      const params = new URLSearchParams({
        task: 'transcribe',
        language: 'en',
        encode: 'true',
        vad_filter: 'true',
        output: 'txt',
        initial_prompt: prompt,
      });
      const response = await fetch(`${baseUrl}/asr?${params}`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(LOCAL_STT_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = (await response.text()).replace(/\s+/g, ' ').trim();
      return { text, latencyMs: Date.now() - started, provider: 'local-whisper' };
    } catch (error) {
      this.logger.warn(`Local Whisper failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async openAi(
    apiKey: string,
    audio: Buffer,
    mimeType: string,
    prompt: string,
  ): Promise<SttResult | null> {
    const started = Date.now();
    try {
      const form = new FormData();
      form.append('file', new Blob([audio], { type: mimeType }), fileName(mimeType));
      form.append('model', STT_MODEL);
      form.append('language', 'en');
      form.append('temperature', '0');
      form.append('prompt', prompt);

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `OpenAI Whisper HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
        );
        return null;
      }
      const body = (await response.json()) as { text?: string };
      return {
        text: (body.text ?? '').trim(),
        latencyMs: Date.now() - started,
        provider: 'openai',
      };
    } catch (error) {
      this.logger.warn(`OpenAI Whisper failed: ${(error as Error).message}`);
      return null;
    }
  }
}

function fileName(mimeType: string): string {
  const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
  return `ptt.${extension}`;
}
