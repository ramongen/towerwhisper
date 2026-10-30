import { Injectable, NotImplementedException } from '@nestjs/common';

/** Speech-to-text via OpenAI Whisper; the prompt carries the session callsigns and ATC vocabulary. */
@Injectable()
export class SttService {
  transcribe(_audio: Buffer, _vocabularyPrompt: string): Promise<string> {
    throw new NotImplementedException('SttService.transcribe');
  }
}
