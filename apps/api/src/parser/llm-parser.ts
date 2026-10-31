import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModeService } from '../app-mode.service';
import { LLM_MODEL, LLM_TIMEOUT_MS } from './constants';
import type { ClearanceFields } from './rule-parser';

export interface LlmResult {
  callsign: string | null;
  fields: ClearanceFields;
}

/** JSON schema of the emit_clearance tool: exactly the instruction fields of Clearance. */
const EMIT_CLEARANCE_TOOL = {
  name: 'emit_clearance',
  description: 'Emit the structured ATC instruction contained in the phrase.',
  input_schema: {
    type: 'object',
    properties: {
      callsign: {
        type: ['string', 'null'],
        description: 'ICAO callsign from the active list, or null',
      },
      altitude: {
        type: 'object',
        properties: {
          valueFt: { type: 'number' },
          action: { enum: ['climb', 'descend', 'maintain'] },
          flightLevel: { type: 'boolean' },
        },
        required: ['valueFt', 'action', 'flightLevel'],
      },
      heading: {
        type: 'object',
        properties: { valueDeg: { type: 'number' }, turn: { enum: ['left', 'right', 'any'] } },
        required: ['valueDeg', 'turn'],
      },
      speed: { type: 'object', properties: { valueKt: { type: 'number' } }, required: ['valueKt'] },
      approach: {
        type: 'object',
        properties: { type: { enum: ['ILS', 'RNP', 'VOR'] }, runway: { type: 'string' } },
        required: ['type', 'runway'],
      },
      frequency: { type: 'object', properties: { mhz: { type: 'string' } }, required: ['mhz'] },
    },
    required: ['callsign'],
  },
};

/**
 * Claude (Haiku) fallback, only when RuleParser found nothing. Hard 2 s timeout; the output
 * is validated field by field before use. Disabled in no-keys mode; never throws.
 */
@Injectable()
export class LlmParser {
  private readonly logger = new Logger(LlmParser.name);
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    private readonly appMode: AppModeService,
  ) {
    this.apiKey = config.get<string>('ANTHROPIC_API_KEY')?.trim();
  }

  get enabled(): boolean {
    return this.appMode.hasAnthropicKey;
  }

  async parse(
    text: string,
    activeCallsigns: { callsign: string; telephony: string }[],
  ): Promise<LlmResult | null> {
    if (!this.enabled || !this.apiKey) return null;

    const aircraftList = activeCallsigns.map((a) => `${a.callsign} ("${a.telephony}")`).join(', ');
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          max_tokens: 300,
          tools: [EMIT_CLEARANCE_TOOL],
          tool_choice: { type: 'tool', name: 'emit_clearance' },
          messages: [
            {
              role: 'user',
              content:
                `Active aircraft: ${aircraftList}.\n` +
                `Parse this radio phrase (controller instruction or pilot readback) near Craiova (LRCV): "${text}". ` +
                'Only include fields that are actually in the phrase.',
            },
          ],
        }),
      });
      if (!response.ok) {
        this.logger.warn(`LLM parser HTTP ${response.status}`);
        return null;
      }
      const body = (await response.json()) as { content?: { type: string; input?: unknown }[] };
      const toolUse = body.content?.find((c) => c.type === 'tool_use');
      return validate(
        toolUse?.input,
        activeCallsigns.map((a) => a.callsign),
      );
    } catch (error) {
      this.logger.warn(`LLM parser failed: ${(error as Error).message}`);
      return null;
    }
  }
}

/** Keeps only fields that match the Clearance types exactly; anything else is dropped. */
export function validate(input: unknown, callsigns: string[]): LlmResult | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, Record<string, unknown> | string | null | undefined>;
  const fields: ClearanceFields = {};

  const alt = raw.altitude;
  if (
    alt &&
    typeof alt === 'object' &&
    typeof alt.valueFt === 'number' &&
    alt.valueFt > 0 &&
    alt.valueFt <= 45000 &&
    (alt.action === 'climb' || alt.action === 'descend' || alt.action === 'maintain') &&
    typeof alt.flightLevel === 'boolean'
  ) {
    fields.altitude = { valueFt: alt.valueFt, action: alt.action, flightLevel: alt.flightLevel };
  }

  const hdg = raw.heading;
  if (
    hdg &&
    typeof hdg === 'object' &&
    typeof hdg.valueDeg === 'number' &&
    hdg.valueDeg >= 1 &&
    hdg.valueDeg <= 360 &&
    (hdg.turn === 'left' || hdg.turn === 'right' || hdg.turn === 'any')
  ) {
    fields.heading = { valueDeg: hdg.valueDeg, turn: hdg.turn };
  }

  const spd = raw.speed;
  if (
    spd &&
    typeof spd === 'object' &&
    typeof spd.valueKt === 'number' &&
    spd.valueKt >= 100 &&
    spd.valueKt <= 400
  ) {
    fields.speed = { valueKt: spd.valueKt };
  }

  const app = raw.approach;
  if (
    app &&
    typeof app === 'object' &&
    typeof app.runway === 'string' &&
    /^\d{2}$/.test(app.runway)
  ) {
    const type = app.type === 'RNP' || app.type === 'VOR' ? app.type : 'ILS';
    fields.approach = { type, runway: app.runway };
  }

  const freq = raw.frequency;
  if (
    freq &&
    typeof freq === 'object' &&
    typeof freq.mhz === 'string' &&
    /^1[1-3]\d\.\d{1,3}$/.test(freq.mhz)
  ) {
    fields.frequency = { mhz: freq.mhz };
  }

  if (Object.keys(fields).length === 0) return null;
  const callsign =
    typeof raw.callsign === 'string' && callsigns.includes(raw.callsign) ? raw.callsign : null;
  return { callsign, fields };
}
