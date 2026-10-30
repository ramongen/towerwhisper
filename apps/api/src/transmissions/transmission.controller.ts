import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  TextTransmissionRequest,
  TransmissionResponse,
  TransmissionUploadFields,
} from '@towerwhisper/shared';
import { TransmissionService, type AudioUpload } from './transmission.service';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

@Controller('transmissions')
export class TransmissionController {
  constructor(private readonly transmissions: TransmissionService) {}

  /** PTT audio (multipart: audio, sessionId, selectedCallsign?, durationMs?). */
  @Post()
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  fromAudio(
    @UploadedFile() audio: AudioUpload,
    @Body() fields: TransmissionUploadFields,
  ): Promise<TransmissionResponse> {
    const durationMs = fields.durationMs ? Number(fields.durationMs) : null;
    return this.transmissions.fromAudio(audio, durationMs, fields.selectedCallsign);
  }

  /** Typed transmission: tests, no-keys mode and the fallback when the microphone fails. */
  @Post('text')
  fromText(@Body() body: TextTransmissionRequest): Promise<TransmissionResponse> {
    return this.transmissions.fromText(body?.text, body?.selectedCallsign);
  }
}
