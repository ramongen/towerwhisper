import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIO_DIR, TTS_CACHE_DIR } from './constants';

/** The two Express response methods we use (no @types/express dependency). */
interface FileResponse {
  setHeader(name: string, value: string): void;
  sendFile(path: string): void;
}

const SAFE_NAME = /^[a-z0-9-]+\.(mp3|webm|ogg|mp4)$/;

/** GET /api/audio/:file — pilot audio (cache or generated) and recorded PTT audio. */
@Controller('audio')
export class AudioController {
  @Get(':file')
  get(@Param('file') file: string, @Res() res: FileResponse): void {
    if (!SAFE_NAME.test(file)) throw new NotFoundException();
    const path = [TTS_CACHE_DIR, AUDIO_DIR].map((dir) => join(dir, file)).find(existsSync);
    if (!path) throw new NotFoundException();
    res.setHeader('cache-control', 'public, max-age=86400');
    res.sendFile(path);
  }
}
