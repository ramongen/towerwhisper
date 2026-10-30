import type { Clearance } from '@towerwhisper/shared';
import { CallsignResolver } from '../src/parser/callsign-resolver';
import type { LlmParser } from '../src/parser/llm-parser';
import { ParserService } from '../src/parser/parser.service';
import { PhraseNormalizer } from '../src/parser/phrase-normalizer';
import { RuleParser } from '../src/parser/rule-parser';
import { ReadbackBuilder, transposedHeading } from '../src/pilot/readback-builder';
import { compare } from '../src/safety/readback-checker';
import { ScenarioLoader } from '../src/session/scenario-loader';

const scenario = new ScenarioLoader().load('craiova-arrivals').aircraft;
const aircraft = scenario.map((a) => ({ ...a, lastContactAt: '', commsAgeS: 0 }));
const parser = new ParserService(
  new PhraseNormalizer(),
  new RuleParser(),
  null as unknown as LlmParser,
  new CallsignResolver(),
);
const builder = new ReadbackBuilder();

function instruction(text: string): Clearance {
  const c = parser.parseWithRules({ text, speaker: 'atc', candidates: aircraft });
  if (!c) throw new Error(`not parsed: ${text}`);
  return c;
}

/** Build the readback, parse it back like PilotService does, and compare. */
function roundTrip(
  text: string,
  fault: Parameters<ReadbackBuilder['build']>[2],
  steppedOn = false,
) {
  const i = instruction(text);
  const rb = builder.build(i, aircraft, fault, steppedOn)!;
  const parsed = parser.parseWithRules({
    text: rb.text,
    speaker: 'pilot',
    candidates: aircraft,
    selectedCallsign: rb.callsign,
  });
  return { rb, parsed, result: compare(i, parsed, parsed?.callsign ?? rb.callsign) };
}

const ROT301 = 'TAROM 301, descend altitude 3000 feet, turn left heading 120';

describe('ReadbackBuilder', () => {
  it('reads back the instruction in standard phraseology', () => {
    const { rb, result } = roundTrip(ROT301, null);
    expect(rb.text).toBe('Descend 3000, left heading 120, TAROM 301');
    expect(result.check).toBe('ok');
  });

  it.each([
    ['wrong_altitude', 'Descend 5000, left heading 120, TAROM 301', 'mismatch'],
    ['wrong_heading', 'Descend 3000, left heading 210, TAROM 301', 'mismatch'],
    ['wrong_turn', 'Descend 3000, right heading 120, TAROM 301', 'mismatch'],
    ['wrong_callsign', 'Descend 3000, left heading 120, WIZZ 44', 'mismatch'],
    ['incomplete', 'Left heading 120, TAROM 301', 'incomplete'],
  ] as const)('%s -> "%s" (%s)', (kind, text, check) => {
    const { rb, result } = roundTrip(ROT301, { kind, once: true });
    expect(rb.text).toBe(text);
    expect(rb.faultApplied).toBe(true);
    expect(result.check).toBe(check);
  });

  it('reads back the wrong runway', () => {
    const { rb, result } = roundTrip('TAROM 301, cleared ILS approach runway zero niner', {
      kind: 'wrong_runway',
      once: true,
    });
    expect(rb.text).toBe('Cleared ILS runway 27, TAROM 301');
    expect(result.check).toBe('mismatch');
  });

  it('does not apply a fault that does not fit the instruction', () => {
    const { rb } = roundTrip('LOT 2RP, turn left heading 180', {
      kind: 'wrong_altitude',
      once: true,
    });
    expect(rb.faultApplied).toBe(false);
  });

  it('a stepped-on readback loses its end and is incomplete', () => {
    const { rb, parsed, result } = roundTrip(
      'WIZZ 44, turn right heading 270, reduce speed 220',
      null,
      true,
    );
    expect(rb.text).toBe('Right heading 270 …');
    expect(parsed?.heading).toEqual({ valueDeg: 270, turn: 'right' });
    expect(result.check).toBe('incomplete');
    expect(result.missing).toEqual(['speed 220 kt']);
  });

  it('transposes heading digits', () => {
    expect(transposedHeading(120)).toBe(210);
    expect(transposedHeading(90)).toBe(120);
  });
});
