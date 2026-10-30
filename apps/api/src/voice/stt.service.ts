import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModeService } from '../app-mode.service';
import { STT_MODEL, STT_TIMEOUT_MS } from './constants';

export interface SttResult {
  text: string;
  latencyMs: number;
}

/** Speech-to-text via OpenAI Whisper; the prompt carries the session callsigns and ATC vocabulary. */
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

  /** Returns null when STT is unavailable or fails; never throws. */
  async transcribe(
    audio: Buffer,
    mimeType: string,
    vocabularyPrompt: string,
  ): Promise<SttResult | null> {
    if (!this.appMode.hasOpenAiKey || !this.apiKey) return null;
    const started = Date.now();
    try {
      const form = new FormData();
      const extension = mimeType.includes('ogg')
        ? 'ogg'
        : mimeType.includes('mp4')
          ? 'mp4'
          : 'webm';
      form.append('file', new Blob([audio], { type: mimeType }), `ptt.${extension}`);
      form.append('model', STT_MODEL);
      form.append('language', 'en');
      form.append('temperature', '0');
      form.append('prompt', vocabularyPrompt);

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `Whisper HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
        );
        return null;
      }
      const body = (await response.json()) as { text?: string };
      return { text: (body.text ?? '').trim(), latencyMs: Date.now() - started };
    } catch (error) {
      this.logger.warn(`Whisper failed: ${(error as Error).message}`);
      return null;
    }
  }
}
