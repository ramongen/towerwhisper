import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppMode, SttProvider } from '@towerwhisper/shared';

/**
 * Decides once, at startup, which speech services are configured.
 * Missing keys or services never crash the app: we fall back to text input, the TTS
 * cache and a disabled LlmParser ("no-keys" mode).
 */
@Injectable()
export class AppModeService implements OnModuleInit {
  private readonly logger = new Logger('AppMode');

  readonly hasOpenAiKey: boolean;
  readonly hasAnthropicKey: boolean;
  /** Base URL of the local Whisper service (docker compose profile "whisper"), if any. */
  readonly whisperUrl: string | null;
  readonly stt: SttProvider;
  readonly mode: AppMode;

  constructor(config: ConfigService) {
    this.hasOpenAiKey = Boolean(config.get<string>('OPENAI_API_KEY')?.trim());
    this.hasAnthropicKey = Boolean(config.get<string>('ANTHROPIC_API_KEY')?.trim());
    this.whisperUrl = config.get<string>('WHISPER_URL')?.trim().replace(/\/$/, '') || null;
    this.stt = this.whisperUrl ? 'local-whisper' : this.hasOpenAiKey ? 'openai' : 'none';
    this.mode = this.stt === 'none' ? 'no-keys' : 'full';
  }

  onModuleInit(): void {
    if (this.stt === 'local-whisper') {
      this.logger.log(
        `Running in "full" mode: local Whisper at ${this.whisperUrl}` +
          (this.hasOpenAiKey ? ', OpenAI Whisper as fallback' : ''),
      );
    } else if (this.stt === 'openai') {
      this.logger.log('Running in "full" mode: OpenAI Whisper STT');
    } else {
      this.logger.warn(
        'Running in "no-keys" mode: no WHISPER_URL or OPENAI_API_KEY, using text input',
      );
    }
    this.logger.log(
      `Pilot voice: ${this.hasOpenAiKey ? 'OpenAI TTS' : 'assets/tts-cache, else browser speech'}`,
    );
    this.logger.log(`LLM fallback parser ${this.hasAnthropicKey ? 'enabled' : 'disabled'}`);
  }
}
