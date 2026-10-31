import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { TransmissionResponse } from '@towerwhisper/shared';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuthUser } from '../auth/auth.service';
import { SectorRegistry } from '../sectors/sector-registry';
import { AUDIO_DIR, AUDIO_URL_PREFIX, PTT_MIN_DURATION_MS } from '../voice/constants';
import { SttService } from '../voice/stt.service';

export interface AudioUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * One controller transmission on the controller's own sector (spec section 6):
 * audio -> STT -> the sector's pipeline (parser, comms, readback, probe, pilot).
 * The PTT audio is kept for the supervisor's replay.
 */
@Injectable()
export class TransmissionService {
  private readonly logger = new Logger(TransmissionService.name);

  constructor(
    private readonly stt: SttService,
    private readonly sectors: SectorRegistry,
  ) {}

  async fromAudio(
    user: AuthUser,
    audio: AudioUpload,
    durationMs: number | null,
    selectedCallsign?: string,
  ): Promise<TransmissionResponse> {
    if (!audio?.buffer?.length) throw new BadRequestException('No audio received');
    if (durationMs !== null && durationMs < PTT_MIN_DURATION_MS) {
      throw new BadRequestException(`PTT shorter than ${PTT_MIN_DURATION_MS} ms discarded`);
    }
    const sector = this.sectors.forRequest(user, undefined);

    const id = randomUUID();
    const audioUrl = await this.saveAudio(id, audio);
    const result = await this.stt.transcribe(
      audio.buffer,
      audio.mimetype || 'audio/webm',
      sector.vocabularyPrompt(),
    );
    if (!result) throw new BadGatewayException('Transcription unavailable: use the text input');
    if (!result.text) throw new BadRequestException('Nothing heard, say again');

    return sector.transmit(result.text, selectedCallsign, {
      id,
      userId: user.id,
      userName: user.name,
      audioUrl,
      sttLatencyMs: result.latencyMs,
    });
  }

  fromText(user: AuthUser, text: string, selectedCallsign?: string): Promise<TransmissionResponse> {
    return this.sectors.forRequest(user, undefined).transmit(text, selectedCallsign, {
      userId: user.id,
      userName: user.name,
      audioUrl: null,
      sttLatencyMs: null,
    });
  }

  private async saveAudio(id: string, audio: AudioUpload): Promise<string | null> {
    try {
      const extension = audio.mimetype?.includes('ogg')
        ? 'ogg'
        : audio.mimetype?.includes('mp4')
          ? 'mp4'
          : 'webm';
      const file = `atc-${id}.${extension}`;
      await mkdir(AUDIO_DIR, { recursive: true });
      await writeFile(join(AUDIO_DIR, file), audio.buffer);
      return AUDIO_URL_PREFIX + file;
    } catch (error) {
      this.logger.warn(`PTT audio not saved: ${(error as Error).message}`);
      return null;
    }
  }
}
