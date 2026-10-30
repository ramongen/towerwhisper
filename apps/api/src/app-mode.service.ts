import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppMode } from '@towerwhisper/shared';

/**
 * Decides once, at startup, which external APIs are available.
 * Missing keys never crash the app: we fall back to text input, the TTS cache
 * and a disabled LlmParser ("no-keys" mode).
 */
@Injectable()
export class AppModeService implements OnModuleInit {
  private readonly logger = new Logger('AppMode');

  readonly hasOpenAiKey: boolean;
  readonly hasAnthropicKey: boolean;
  readonly mode: AppMode;

  constructor(config: ConfigService) {
    this.hasOpenAiKey = Boolean(config.get<string>('OPENAI_API_KEY')?.trim());
    this.hasAnthropicKey = Boolean(config.get<string>('ANTHROPIC_API_KEY')?.trim());
    this.mode = this.hasOpenAiKey ? 'full' : 'no-keys';
  }

  onModuleInit(): void {
    if (this.mode === 'full') {
      this.logger.log('Running in "full" mode: Whisper STT and OpenAI TTS enabled');
    } else {
      this.logger.warn(
        'Running in "no-keys" mode: OPENAI_API_KEY missing, using text input and assets/tts-cache',
      );
    }
    this.logger.log(`LLM fallback parser ${this.hasAnthropicKey ? 'enabled' : 'disabled'}`);
  }
}
