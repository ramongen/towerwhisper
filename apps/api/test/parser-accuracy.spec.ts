import type { Clearance } from '@towerwhisper/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One entry of test/phrases.json: input text -> expected Clearance fields. */
interface PhraseCase {
  input: string;
  speaker: Clearance['speaker'];
  expected: Partial<Omit<Clearance, 'id' | 'rawText' | 'confidence' | 'parsePath'>>;
}

const phrases = JSON.parse(readFileSync(join(__dirname, 'phrases.json'), 'utf-8')) as PhraseCase[];

describe('parser accuracy over test/phrases.json', () => {
  it('loads the phrase set', () => {
    expect(phrases.length).toBeGreaterThan(0);
    for (const phrase of phrases) {
      expect(typeof phrase.input).toBe('string');
      expect(['atc', 'pilot']).toContain(phrase.speaker);
      expect(phrase.expected.callsign).toBeDefined();
    }
  });

  // Enable once PhraseNormalizer + RuleParser + CallsignResolver exist; report per-field accuracy.
  it.skip('parses every phrase into the expected Clearance', () => {
    // for each phrase: normalize -> parse -> resolve callsign -> compare fields with phrase.expected
  });
});
