import { CallsignResolver } from '../src/parser/callsign-resolver';
import type { LlmParser } from '../src/parser/llm-parser';
import { ParserService } from '../src/parser/parser.service';
import { PhraseNormalizer } from '../src/parser/phrase-normalizer';
import { RuleParser } from '../src/parser/rule-parser';
import { HistorySession } from '../src/demo/history-session';
import { seededRandom } from '../src/demo/demo-history.service';
import { SECTORS } from '../src/sectors/sectors';

const parser = new ParserService(
  new PhraseNormalizer(),
  new RuleParser(),
  null as unknown as LlmParser,
  new CallsignResolver(),
);
const generated = SECTORS.filter((s) => !s.definition.scenario);
const MINUTES = 15;

/** Past sessions for the supervisor dashboard, recorded headless at startup. */
describe('demo history', () => {
  it.each(generated.map((s) => [s.definition.id, s] as const))(
    '%s: a past session with alerts, comms and radar, all inside the session',
    async (id, sector) => {
      const startedAt = new Date('2026-10-01T08:00:00Z');
      const session = await new HistorySession({
        sector,
        parser,
        controller: { id: 'c0ffee00-0000-4000-8000-000000000000', name: 'Test Controller' },
        commsLimits: { cautionS: 1800, warningS: 3600 },
        startedAt,
        minutes: MINUTES,
        recordRadar: true,
        random: seededRandom(`${id}:test`),
      }).run();

      const from = startedAt.getTime();
      const to = session.endedAt.getTime();
      expect(to - from).toBe(MINUTES * 60_000);
      const inside = (iso: string) => Date.parse(iso) >= from && Date.parse(iso) <= to;

      // The controller called every arrival and the pilots answered through the parser.
      const atc = session.comms.filter((c) => c.payload.speaker === 'atc');
      const pilot = session.comms.filter((c) => c.payload.speaker === 'pilot');
      expect(atc.length).toBeGreaterThanOrEqual(6);
      expect(pilot.length).toBeGreaterThanOrEqual(atc.length / 2);
      expect(atc.filter((c) => !c.payload.clearance).map((c) => c.payload.transcript)).toEqual([]);
      expect(atc.every((c) => c.userId)).toBe(true);
      expect(session.comms.every((c) => inside(c.payload.at))).toBe(true);

      // Real alerts from the safety checks, explained, ended, with past timestamps.
      expect(session.alerts.length).toBeGreaterThanOrEqual(2);
      for (const { alert } of session.alerts) {
        expect(alert.message).toContain(alert.callsigns[0]);
        expect(inside(alert.raisedAt)).toBe(true);
        expect(alert.endedAt && inside(alert.endedAt)).toBe(true);
        expect(Date.parse(alert.endedAt!)).toBeGreaterThanOrEqual(Date.parse(alert.raisedAt));
      }
      expect(session.alerts.some((a) => a.resolvedBy)).toBe(true);

      // A radar picture every 2 s for the replay.
      expect(session.frames.length).toBeGreaterThan(MINUTES * 25);
      expect(session.frames.every((f) => f.at.getTime() >= from && f.at.getTime() <= to)).toBe(
        true,
      );
    },
  );
});
