import { Injectable } from '@nestjs/common';
import { DIGIT_WORDS, PHONETIC_LETTERS } from './constants';

const SMALL_NUMBERS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
};

/**
 * Lowercases, strips punctuation and normalises ICAO number pronunciation, so the
 * RuleParser regexes only ever see digits:
 *
 *   'TAROM 301, descend altitude three thousand feet' -> 'tarom 301 descend altitude 3000 feet'
 *   'flight level six zero' / 'FL 60'                  -> 'fl060'
 *   'runway zero niner'                                -> 'rwy09'
 *   'runway two six left'                              -> 'rwy26l'
 *   'one two one decimal three'                        -> '121.3'
 *   'nine tango charlie'                               -> '9tc'
 */
@Injectable()
export class PhraseNormalizer {
  normalize(text: string): string {
    let s = text.toLowerCase();
    s = s.replace(/(\d),(\d{3})/g, '$1$2'); // 3,000 -> 3000
    s = s.replace(/(\d)\.(\d)/g, '$1decimalpoint$2'); // keep 121.3 through punctuation removal
    s = s.replace(/[^a-z0-9\s-]/g, ' ').replace(/-/g, ' ');
    s = s.replace(/decimalpoint/g, '.');
    // Whisper writes "niner" as "9r" / "9er" / "9ir" ("heading 2 6 9R"): back to 9. Not after
    // "runway", where 9R is a runway side (runway 0 9R).
    s = s.replace(/(?<!\b(?:runway|rwy)[\s\d]*)\b(\d*9)(?:er|ir|r)\b/g, '$1');

    const tokens = this.mergeSpokenNumbers(s.split(/\s+/).filter(Boolean));
    let out = tokens.join(' ');

    // 121 decimal 3 -> 121.3
    out = out.replace(/\b(\d{3}) (?:decimal|point) (\d{1,3})\b/g, '$1.$2');
    // flight level 60 / fl 60 / fl60 -> fl060
    out = out.replace(
      /\b(?:flight level|fl) ?(\d{2,3})\b/g,
      (_m, n: string) => `fl${n.padStart(3, '0')}`,
    );
    // runway 09 -> rwy09; runway 26 left -> rwy26l (parallel runways, e.g. LROP)
    out = out.replace(
      /\brunway (\d{2})(?: (left|right|center|centre|l|r|c)\b)?/g,
      (_m, n: string, side?: string) => `rwy${n}${side ? side[0] : ''}`,
    );
    // ft -> feet, kts -> knots
    out = out.replace(/\bft\b/g, 'feet').replace(/\b(?:kts|kt)\b/g, 'knots');
    return out.replace(/\s+/g, ' ').trim();
  }

  /**
   * Turns spoken digits into numbers. Consecutive single digits are concatenated as a
   * string ('zero niner' -> '09', 'one two zero' -> '120'); 'three thousand five hundred'
   * becomes 3500; phonetic letters right after digits join them ('9 tango charlie' -> '9tc').
   */
  private mergeSpokenNumbers(raw: string[]): string[] {
    const out: string[] = [];
    let i = 0;
    while (i < raw.length) {
      const digit = this.digitOf(raw[i]);
      if (digit === null) {
        out.push(raw[i]);
        i++;
        continue;
      }

      // A run of spoken single digits; a number already written as digits ('301') stands alone
      let run = digit;
      i++;
      while (digit.length === 1 && i < raw.length) {
        const next = this.digitOf(raw[i]);
        if (next === null || next.length > 1 || run.length >= 5) break;
        run += next;
        i++;
      }

      // 'three thousand [five hundred]' / 'one zero thousand'
      if (raw[i] === 'thousand') {
        let value = Number(run) * 1000;
        i++;
        const hundreds = this.digitOf(raw[i] ?? '');
        if (hundreds !== null && raw[i + 1] === 'hundred') {
          value += Number(hundreds) * 100;
          i += 2;
        }
        out.push(String(value));
        continue;
      }
      if (raw[i] === 'hundred') {
        out.push(String(Number(run) * 100));
        i++;
        continue;
      }

      // Phonetic letters straight after digits belong to a callsign: '2 romeo papa' -> '2rp'
      while (i < raw.length && PHONETIC_LETTERS[raw[i]]) {
        run += PHONETIC_LETTERS[raw[i]];
        i++;
      }
      out.push(run);
    }
    return out;
  }

  /** '9' / 'niner' / 'nine' -> '9'; '12' stays '12'; 'twenty' -> '20'; anything else -> null. */
  private digitOf(token: string): string | null {
    if (/^\d+$/.test(token)) return token;
    if (token in DIGIT_WORDS) return DIGIT_WORDS[token];
    if (token in SMALL_NUMBERS) return String(SMALL_NUMBERS[token]);
    return null;
  }
}
