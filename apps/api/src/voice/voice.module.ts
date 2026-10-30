import { Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { SttService } from './stt.service';
import { TtsService } from './tts.service';

@Module({
  controllers: [AudioController],
  providers: [SttService, TtsService],
  exports: [SttService, TtsService],
})
export class VoiceModule {}
