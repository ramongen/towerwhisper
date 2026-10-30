import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { TransmissionResponse } from '@towerwhisper/shared';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STT_VOCABULARY } from '../parser/constants';
import { ParserService } from '../parser/parser.service';
import { PilotService } from '../pilot/pilot.service';
import { targetsFor } from '../pilot/targets';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ClearanceProbe } from '../safety/clearance-probe';
import { ReadbackChecker } from '../safety/readback-checker';
import { SessionService } from '../session/session.service';
import { SimulationService } from '../simulation/simulation.service';
import { AUDIO_DIR, AUDIO_URL_PREFIX, PTT_MIN_DURATION_MS } from '../voice/constants';
import { SttService } from '../voice/stt.service';

export interface AudioUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * One controller transmission, step by step (spec section 6):
 * audio -> STT -> parser -> Clearance -> comms:transmission + clearance:issued ->
 * readback expected, clearance probed -> PilotService answers.
 */
@Injectable()
export class TransmissionService {
  private readonly logger = new Logger(TransmissionService.name);

  constructor(
    private readonly stt: SttService,
    private readonly parser: ParserService,
    private readonly simulation: SimulationService,
    private readonly readbackChecker: ReadbackChecker,
    private readonly probe: ClearanceProbe,
    private readonly pilot: PilotService,
    private readonly realtime: RealtimeGateway,
    private readonly sessions: SessionService,
  ) {}

  async fromAudio(
    audio: AudioUpload,
    durationMs: number | null,
    selectedCallsign?: string,
  ): Promise<TransmissionResponse> {
    if (!audio?.buffer?.length) throw new BadRequestException('No audio received');
    if (durationMs !== null && durationMs < PTT_MIN_DURATION_MS) {
      throw new BadRequestException(`PTT shorter than ${PTT_MIN_DURATION_MS} ms discarded`);
    }

    const id = randomUUID();
    const audioPath = await this.saveAudio(id, audio);
    const vocabulary = this.vocabularyPrompt();
    const result = await this.stt.transcribe(
      audio.buffer,
      audio.mimetype || 'audio/webm',
      vocabulary,
    );
    if (!result) throw new BadGatewayException('Transcription unavailable: use the text input');
    if (!result.text) throw new BadRequestException('Nothing heard, say again');

    this.sessions.attachAudio(id, audioPath, result.latencyMs);
    return this.handleText(result.text, selectedCallsign, id);
  }

  async fromText(text: string, selectedCallsign?: string): Promise<TransmissionResponse> {
    if (typeof text !== 'string' || !text.trim())
      throw new BadRequestException('Empty transmission');
    return this.handleText(text.trim(), selectedCallsign, randomUUID());
  }

  private async handleText(
    text: string,
    selectedCallsign: string | undefined,
    id: string,
  ): Promise<TransmissionResponse> {
    const aircraft = this.simulation.getAircraft();
    const clearance = await this.parser.parse({
      text,
      speaker: 'atc',
      candidates: aircraft,
      selectedCallsign: selectedCallsign || null,
      fixes: this.simulation.getFixes().map((f) => f.name),
    });

    this.realtime.broadcastTransmission({ id, speaker: 'atc', transcript: text, clearance });
    if (!clearance) {
      this.logger.log(`Unparsed transmission: "${text}"`);
      return { transmissionId: id, transcript: text, clearance: null };
    }

    this.simulation.touchContact(clearance.callsign);
    this.readbackChecker.expect(clearance, this.simulation.simNowMs());

    // Clearance Probe: what this instruction would do to separation, before it is flown.
    const probe = this.probe.probe(clearance.callsign, targetsFor(clearance), aircraft);
    this.realtime.broadcastProbe(probe);
    for (const conflict of probe.conflicts) this.probe.raise(clearance.callsign, conflict);

    this.pilot.handleInstruction(clearance);
    return { transmissionId: id, transcript: text, clearance };
  }

  /** "TAROM 301, WIZZ 44, ..." + ATC vocabulary, so Whisper spells callsigns and terms right. */
  private vocabularyPrompt(): string {
    const callsigns = this.simulation.getAircraft().map((a) => a.telephony);
    const fixes = this.simulation.getFixes().map((f) => f.name);
    return `${callsigns.join(', ')}. ${STT_VOCABULARY}, direct ${fixes.join(', ')}.`;
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
