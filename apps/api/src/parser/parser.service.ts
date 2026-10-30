import { Injectable } from '@nestjs/common';
import type { Clearance } from '@towerwhisper/shared';
import { randomUUID } from 'node:crypto';
import { CallsignResolver, type CallsignCandidate } from './callsign-resolver';
import { LLM_CONFIDENCE, RULES_CONFIDENCE, RULES_CONFIDENCE_FALLBACK_CALLSIGN } from './constants';
import { LlmParser } from './llm-parser';
import { PhraseNormalizer } from './phrase-normalizer';
import { RuleParser } from './rule-parser';

export interface ParseRequest {
  text: string;
  speaker: Clearance['speaker'];
  candidates: CallsignCandidate[];
  selectedCallsign?: string | null;
}

/**
 * Text -> Clearance. Rules first; the LLM only when no rule matched. The same path parses
 * controller instructions and pilot readbacks. Returns null when the phrase is unparsed.
 */
@Injectable()
export class ParserService {
  constructor(
    private readonly normalizer: PhraseNormalizer,
    private readonly rules: RuleParser,
    private readonly llm: LlmParser,
    private readonly callsigns: CallsignResolver,
  ) {}

  async parse(request: ParseRequest): Promise<Clearance | null> {
    const fromRules = this.parseWithRules(request);
    if (fromRules) return fromRules;

    const fromLlm = await this.llm.parse(request.text, request.candidates);
    if (!fromLlm) return null;
    const callsign = fromLlm.callsign ?? request.selectedCallsign ?? null;
    if (!callsign) return null;
    return {
      id: randomUUID(),
      callsign,
      speaker: request.speaker,
      ...fromLlm.fields,
      rawText: request.text,
      confidence: LLM_CONFIDENCE,
      parsePath: 'llm',
    };
  }

  /** Deterministic part only (also used by the parser accuracy test). */
  parseWithRules({ text, speaker, candidates, selectedCallsign }: ParseRequest): Clearance | null {
    const normalized = this.normalizer.normalize(text);
    const fields = this.rules.parse(normalized);
    if (!fields) return null;
    const resolved = this.callsigns.resolve(normalized, speaker, candidates, selectedCallsign);
    if (!resolved) return null;
    return {
      id: randomUUID(),
      callsign: resolved.callsign,
      speaker,
      ...fields,
      rawText: text,
      confidence: resolved.heard ? RULES_CONFIDENCE : RULES_CONFIDENCE_FALLBACK_CALLSIGN,
      parsePath: 'rules',
    };
  }
}
