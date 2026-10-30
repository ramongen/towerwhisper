/**
 * Pre-generates the pilot audio of the scripted demo into assets/tts-cache, so the demo
 * has a voice in no-keys mode. Run once with a key, then commit the MP3 files:
 *
 *   OPENAI_API_KEY=sk-... pnpm --filter api tts:cache
 *
 * For every scripted phrase it renders the correct readback and each readback fault.
 */
import type { FaultConfig } from '@towerwhisper/shared';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CallsignResolver } from '../parser/callsign-resolver';
import type { LlmParser } from '../parser/llm-parser';
import { ParserService } from '../parser/parser.service';
import { PhraseNormalizer } from '../parser/phrase-normalizer';
import { RuleParser } from '../parser/rule-parser';
import { ReadbackBuilder } from '../pilot/readback-builder';
import { CONFLICT_INTRUDER } from '../demo/constants';
import { DEFAULT_SCENARIO, SCRIPTED_PHRASES } from '../session/constants';
import { ScenarioLoader } from '../session/scenario-loader';
import { TTS_CACHE_DIR } from '../voice/constants';
import { cacheFileName, generateSpeech, voiceFor } from '../voice/tts.service';

type ReadbackFault = NonNullable<FaultConfig['readback']>;
const FAULTS: (ReadbackFault | null)[] = [
  null,
  ...(
    [
      'wrong_altitude',
      'wrong_heading',
      'wrong_turn',
      'wrong_runway',
      'wrong_callsign',
      'incomplete',
    ] as const
  ).map((kind) => ({ kind, once: true })),
];

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is required to generate the cache');

  const aircraft = new ScenarioLoader()
    .load(DEFAULT_SCENARIO)
    .aircraft.concat({
      ...CONFLICT_INTRUDER,
      lat: 44.3,
      lon: 23.9,
      altitudeFt: 7000,
      headingDeg: 0,
      verticalSpeedFpm: 0,
      turnRateDegS: 0,
      target: {},
    })
    .map((a) => ({ ...a, lastContactAt: '', commsAgeS: 0 }));
  const parser = new ParserService(
    new PhraseNormalizer(),
    new RuleParser(),
    null as unknown as LlmParser,
    new CallsignResolver(),
  );
  const builder = new ReadbackBuilder();

  const texts = new Map<string, string>(); // file -> text
  for (const phrase of SCRIPTED_PHRASES) {
    const instruction = parser.parseWithRules({
      text: phrase,
      speaker: 'atc',
      candidates: aircraft,
    });
    if (!instruction) throw new Error(`Scripted phrase not parsed: ${phrase}`);
    for (const fault of FAULTS) {
      for (const steppedOn of [false, true]) {
        const readback = builder.build(instruction, aircraft, fault, steppedOn);
        if (!readback || (fault && !readback.faultApplied) || !/[a-z0-9]/i.test(readback.text))
          continue;
        const voice = voiceFor(readback.callsign);
        texts.set(cacheFileName(readback.text, voice), `${voice}|${readback.text}`);
      }
    }
  }

  mkdirSync(TTS_CACHE_DIR, { recursive: true });
  let created = 0;
  for (const [file, entry] of texts) {
    const path = join(TTS_CACHE_DIR, file);
    if (existsSync(path)) continue;
    const [voice, text] = entry.split('|');
    writeFileSync(path, await generateSpeech(apiKey, text, voice));
    created++;
    console.log(`${file}  ${text}`);
  }
  console.log(`${created} new, ${texts.size - created} already cached, in ${TTS_CACHE_DIR}`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
