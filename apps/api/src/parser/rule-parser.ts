import { Injectable } from '@nestjs/common';
import type { Clearance, TurnDir } from '@towerwhisper/shared';

/** The instruction fields a phrase can carry (everything in Clearance except identity/metadata). */
export type ClearanceFields = Pick<
  Clearance,
  'altitude' | 'heading' | 'speed' | 'approach' | 'frequency'
>;

/**
 * One regex per instruction type, run over the normalised text (see PhraseNormalizer).
 * A phrase can hold several instructions; every rule is applied.
 * The same rules read controller instructions and pilot readbacks.
 */
const RULES = {
  // 'descend altitude 3000 feet', 'descend and maintain fl080', 'climbing fl120', 'maintain 5000'
  altitude:
    /\b(climb|descend|maintain)(?:ing)?(?:\s+and\s+maintain)?(?:\s+to)?(?:\s+altitude)?\s+(?:fl(\d{3})|(\d{3,5})(?!\s*knots))\b/,
  // 'turn left heading 120', 'left heading 120', 'fly heading 090', 'heading 270'
  heading: /\b(?:turn\s+)?(?:(left|right)\s+)?(?:fly\s+)?heading\s+(\d{3})\b/,
  // 'reduce speed 220', 'speed 220 knots', 'reduce 220 knots'
  speed: /\b(?:(?:reduce|increase|maintain)\s+(?:speed\s+)?(?:to\s+)?|speed\s+)(\d{3})\b/,
  // 'cleared ils approach rwy09', 'cleared ils rwy09', 'ils 09'
  approach: /\bils(?:\s+approach)?\s+(?:rwy)?(\d{2})\b/,
  // 'contact bucharest 121.3', '121.3' (VHF airband 118.000-136.975)
  frequency: /\b(1[1-3]\d\.\d{1,3})\b/,
};

@Injectable()
export class RuleParser {
  /** Returns the instruction fields found, or null when no rule matched. */
  parse(normalized: string): ClearanceFields | null {
    const fields: ClearanceFields = {};

    const alt = RULES.altitude.exec(normalized);
    if (alt) {
      const flightLevel = alt[2] !== undefined;
      fields.altitude = {
        valueFt: flightLevel ? Number(alt[2]) * 100 : Number(alt[3]),
        action: alt[1] as 'climb' | 'descend' | 'maintain',
        flightLevel,
      };
    }

    const hdg = RULES.heading.exec(normalized);
    if (hdg) {
      const valueDeg = Number(hdg[2]);
      if (valueDeg >= 1 && valueDeg <= 360) {
        fields.heading = { valueDeg, turn: (hdg[1] as TurnDir | undefined) ?? 'any' };
      }
    }

    const spd = RULES.speed.exec(normalized);
    if (spd) fields.speed = { valueKt: Number(spd[1]) };

    const app = RULES.approach.exec(normalized);
    if (app) fields.approach = { type: 'ILS', runway: app[1] };

    const freq = RULES.frequency.exec(normalized);
    if (freq) fields.frequency = { mhz: freq[1] };

    return Object.keys(fields).length > 0 ? fields : null;
  }
}
