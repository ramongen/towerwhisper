import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModeService } from '../app-mode.service';
import type { AuthUser } from '../auth/auth.service';
import { measureParserAccuracy, type PhraseCase } from '../parser/parser-accuracy';
import { ParserService } from '../parser/parser.service';
import { DEFAULT_COMMS_CAUTION_MIN, DEFAULT_COMMS_WARNING_MIN } from '../safety/constants';
import { ScenarioLoader } from '../session/scenario-loader';
import { DEFAULT_SCENARIO } from '../session/constants';
import { TtsService } from '../voice/tts.service';
import { SectorRuntime } from './sector-runtime';
import { DEFAULT_SECTOR_ID, findSector, SECTORS } from './sectors';
import { SessionStore } from './session-store';

const PHRASES_FILE = join(__dirname, '..', '..', 'test', 'phrases.json');

/**
 * Every sector's live session, started at boot and running side by side. Requests and screens
 * reach a sector through here: an ATC always gets its own, a supervisor or the demo panel the
 * one it names (X-Sector-Id), Craiova Approach by default.
 */
@Injectable()
export class SectorRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SectorRegistry.name);
  private readonly runtimes = new Map<string, SectorRuntime>();
  private parserAccuracy: number | null = null;

  constructor(
    env: ConfigService,
    parser: ParserService,
    tts: TtsService,
    appMode: AppModeService,
    private readonly store: SessionStore,
  ) {
    const cautionMin = Number(env.get('COMMS_CAUTION_MIN') ?? DEFAULT_COMMS_CAUTION_MIN);
    const warningMin = Number(env.get('COMMS_WARNING_MIN') ?? DEFAULT_COMMS_WARNING_MIN);
    const deps = {
      parser,
      tts,
      store,
      appMode,
      commsLimits: { cautionS: cautionMin * 60, warningS: warningMin * 60 },
      parserAccuracy: () => this.parserAccuracy,
    };
    for (const sector of SECTORS) {
      this.runtimes.set(sector.definition.id, new SectorRuntime(sector, deps));
    }
    this.parserAccuracy = this.measureParser(parser);
  }

  async onModuleInit(): Promise<void> {
    await this.store.forgetRemovedSectors(SECTORS.map((s) => s.definition.id));
    await this.store.closeOpenSessions();
    for (const runtime of this.runtimes.values()) await runtime.start();
    this.logger.log(`${this.runtimes.size} sectors live: ${[...this.runtimes.keys()].join(', ')}`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const runtime of this.runtimes.values()) await runtime.stop();
  }

  all(): SectorRuntime[] {
    return [...this.runtimes.values()];
  }

  get(sectorId: string): SectorRuntime {
    const runtime = this.runtimes.get(sectorId);
    if (!runtime) throw new NotFoundException(`Unknown sector ${sectorId}`);
    return runtime;
  }

  /**
   * The sector a request acts on: an ATC's own (whatever the header says), otherwise the
   * one named in the header, else Craiova Approach.
   */
  forRequest(user: AuthUser | undefined, requested: string | string[] | undefined): SectorRuntime {
    if (user?.role === 'atc') {
      if (!user.sectorId) throw new ForbiddenException('No sector assigned to your account yet');
      return this.get(user.sectorId);
    }
    const id =
      typeof requested === 'string' && findSector(requested) ? requested : DEFAULT_SECTOR_ID;
    return this.get(id);
  }

  private measureParser(parser: ParserService): number | null {
    try {
      const phrases = JSON.parse(readFileSync(PHRASES_FILE, 'utf-8')) as PhraseCase[];
      const scenario = new ScenarioLoader().load(DEFAULT_SCENARIO);
      const report = measureParserAccuracy(
        parser,
        phrases,
        scenario.aircraft,
        scenario.fixes.map((f) => f.name),
      );
      this.logger.log(
        `Parser accuracy on ${phrases.length} test phrases: ${(report.accuracy * 100).toFixed(1)}%`,
      );
      return report.accuracy;
    } catch (error) {
      this.logger.warn(`Parser accuracy not measured: ${(error as Error).message}`);
      return null;
    }
  }
}
