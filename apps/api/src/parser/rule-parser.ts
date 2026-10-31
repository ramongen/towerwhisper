import { Injectable } from '@nestjs/common';
import type { ApproachType, Clearance, TurnDir } from '@towerwhisper/shared';

/** The instruction fields a phrase can carry (everything in Clearance except identity/metadata). */
export type ClearanceFields = Pick<
  Clearance,
  'altitude' | 'heading' | 'speed' | 'approach' | 'frequency' | 'direct' | 'landing' | 'goAround'
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
  // 'cleared ils approach rwy26', 'cleared ils rwy26', 'ils 26', 'cleared rnp approach rwy08'
  approach: /\b(ils|rnp|vor)(?:\s+approach)?\s+(?:rwy)?(\d{2}[lrc]?)\b/,
  // 'contact bucharest 121.3', '121.3' (VHF airband 118.000-136.975)
  frequency: /\b(1[1-3]\d\.\d{1,3})\b/,
  // 'proceed direct kovad', 'direct to kovad' (the fix name is checked by ParserService)
  direct: /\bdirect(?:\s+to)?\s+([a-z]{4,6})\b/,
  // 'cleared to land rwy26', 'cleared to land'
  landing: /\bcleared\s+to\s+land(?:\s+rwy(\d{2}[lrc]?))?\b/,
  // 'go around', 'going around'
  goAround: /\bgo(?:ing)?\s+around\b/,
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
    if (app)
      fields.approach = {
        type: app[1].toUpperCase() as ApproachType,
        runway: app[2].toUpperCase(),
      };

    const freq = RULES.frequency.exec(normalized);
    if (freq) fields.frequency = { mhz: freq[1] };

    const direct = RULES.direct.exec(normalized);
    if (direct) fields.direct = { fix: direct[1].toUpperCase() };

    const landing = RULES.landing.exec(normalized);
    if (landing) fields.landing = { runway: landing[1]?.toUpperCase() ?? null };

    if (RULES.goAround.test(normalized)) fields.goAround = true;

    return Object.keys(fields).length > 0 ? fields : null;
  }
}
