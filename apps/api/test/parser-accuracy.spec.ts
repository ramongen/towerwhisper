import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CallsignResolver } from '../src/parser/callsign-resolver';
import type { LlmParser } from '../src/parser/llm-parser';
import { measureParserAccuracy, type PhraseCase } from '../src/parser/parser-accuracy';
import { ParserService } from '../src/parser/parser.service';
import { PhraseNormalizer } from '../src/parser/phrase-normalizer';
import { RuleParser } from '../src/parser/rule-parser';
import { ScenarioLoader } from '../src/session/scenario-loader';

const phrases = JSON.parse(readFileSync(join(__dirname, 'phrases.json'), 'utf-8')) as PhraseCase[];
const scenario = new ScenarioLoader().load('craiova-arrivals');
const candidates = scenario.aircraft;
const fixes = scenario.fixes.map((f) => f.name);
// The LLM fallback is never reached by parseWithRules.
const parser = new ParserService(
  new PhraseNormalizer(),
  new RuleParser(),
  null as unknown as LlmParser,
  new CallsignResolver(),
);

describe('parser accuracy over test/phrases.json', () => {
  it('loads the phrase set', () => {
    expect(phrases.length).toBeGreaterThanOrEqual(60);
    for (const phrase of phrases) {
      expect(typeof phrase.input).toBe('string');
      expect(['atc', 'pilot']).toContain(phrase.speaker);
      expect(phrase.expected.callsign).toBeDefined();
    }
  });

  it('parses every phrase into the expected Clearance', () => {
    const report = measureParserAccuracy(parser, phrases, candidates, fixes);
    const lines = Object.entries(report.perField).map(
      ([field, { correct, total }]) => `  ${field.padEnd(10)} ${correct}/${total}`,
    );
    console.log(`Parser accuracy ${(report.accuracy * 100).toFixed(1)}%\n${lines.join('\n')}`);
    expect(report.failures).toEqual([]);
  });
});

describe('PhraseNormalizer', () => {
  const normalizer = new PhraseNormalizer();
  it.each([
    ['TAROM 301, descend altitude three thousand feet', 'tarom 301 descend altitude 3000 feet'],
    ['flight level six zero', 'fl060'],
    ['FL 60', 'fl060'],
    ['runway zero niner', 'rwy09'],
    ['one two one decimal three', '121.3'],
    ['Lufthansa nine tango charlie', 'lufthansa 9tc'],
    ['tree thousand fife hundred', '3500'],
    ['3,000 ft', '3000 feet'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizer.normalize(input)).toBe(expected);
  });
});

describe('CallsignResolver', () => {
  const resolver = new CallsignResolver();
  it('falls back to the radar selection when no callsign is heard', () => {
    expect(resolver.resolve('descend 3000', 'atc', candidates, 'WZZ44')).toEqual({
      callsign: 'WZZ44',
      heard: false,
    });
  });
  it('ignores aircraft that are not in the session', () => {
    expect(resolver.resolve('blue air 12 descend 3000', 'atc', candidates)).toBeNull();
  });
});
