import type { Clearance } from '@towerwhisper/shared';
import { isDeepStrictEqual } from 'node:util';
import type { CallsignCandidate } from './callsign-resolver';
import type { ParserService } from './parser.service';

/** One entry of test/phrases.json: input text -> expected Clearance fields. */
export interface PhraseCase {
  input: string;
  speaker: Clearance['speaker'];
  expected: Partial<Omit<Clearance, 'id' | 'rawText' | 'confidence' | 'parsePath'>>;
}

const FIELDS = [
  'callsign',
  'altitude',
  'heading',
  'speed',
  'approach',
  'frequency',
  'direct',
  'landing',
  'goAround',
] as const;

export interface AccuracyReport {
  /** correct fields / scored fields, 0-1 */
  accuracy: number;
  perField: Record<string, { correct: number; total: number }>;
  failures: { input: string; field: string; expected: unknown; actual: unknown }[];
}

/**
 * Scores the rule parser field by field. A field is scored when it is expected or produced,
 * so both missed and invented values count as errors.
 */
export function measureParserAccuracy(
  parser: ParserService,
  phrases: PhraseCase[],
  candidates: CallsignCandidate[],
  fixes: string[] = [],
): AccuracyReport {
  const perField: AccuracyReport['perField'] = {};
  const failures: AccuracyReport['failures'] = [];
  let correct = 0;
  let total = 0;

  for (const phrase of phrases) {
    const actual = parser.parseWithRules({
      text: phrase.input,
      speaker: phrase.speaker,
      candidates,
      fixes,
    });
    for (const field of FIELDS) {
      const expected = phrase.expected[field];
      const got = actual?.[field];
      if (expected === undefined && got === undefined) continue;

      const ok = isDeepStrictEqual(expected, got);
      perField[field] ??= { correct: 0, total: 0 };
      perField[field].total++;
      total++;
      if (ok) {
        perField[field].correct++;
        correct++;
      } else {
        failures.push({ input: phrase.input, field, expected, actual: got });
      }
    }
  }

  return { accuracy: total === 0 ? 0 : correct / total, perField, failures };
}
