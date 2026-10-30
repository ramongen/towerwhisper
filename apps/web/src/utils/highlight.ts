import type { Clearance } from '@towerwhisper/shared';

export interface TextPart {
  text: string;
  kind: 'plain' | 'key' | 'bad';
}

/**
 * Splits a transcript into plain text and highlighted values (numbers, 'flight level 80',
 * 'left'/'right' after a mismatch). `bad` holds the values that differ from the instruction.
 */
export function highlight(transcript: string, bad: Set<string>): TextPart[] {
  const parts: TextPart[] = [];
  const pattern = /(flight level \d+|\b\d[\d.,]*\b|\b(?:left|right)\b)/gi;
  let last = 0;
  for (const match of transcript.matchAll(pattern)) {
    const value = match[0];
    const isTurn = /^(left|right)$/i.test(value);
    if (isTurn && !bad.has(value.toLowerCase())) continue; // turn words only stand out when wrong
    if (match.index > last)
      parts.push({ text: transcript.slice(last, match.index), kind: 'plain' });
    const normalized = value
      .toLowerCase()
      .replace(/,/g, '')
      .replace(/^flight level /, 'fl');
    parts.push({ text: value, kind: bad.has(normalized) ? 'bad' : 'key' });
    last = match.index + value.length;
  }
  if (last < transcript.length) parts.push({ text: transcript.slice(last), kind: 'plain' });
  return parts;
}

/** Values in the readback that differ from the instruction, in the forms highlight() looks for. */
export function differingValues(
  instruction: Clearance | null,
  readback: Clearance | null,
): {
  values: Set<string>;
  fields: Set<string>;
} {
  const values = new Set<string>();
  const fields = new Set<string>();
  if (!instruction || !readback) return { values, fields };

  const alt = readback.altitude;
  if (alt && instruction.altitude && alt.valueFt !== instruction.altitude.valueFt) {
    fields.add('altitude');
    values.add(String(alt.valueFt));
    values.add(`fl${alt.valueFt / 100}`);
  }
  const hdg = readback.heading;
  if (hdg && instruction.heading) {
    if (hdg.valueDeg !== instruction.heading.valueDeg) {
      fields.add('heading');
      values.add(String(hdg.valueDeg).padStart(3, '0'));
      values.add(String(hdg.valueDeg));
    } else if (
      instruction.heading.turn !== 'any' &&
      hdg.turn !== 'any' &&
      hdg.turn !== instruction.heading.turn
    ) {
      fields.add('heading');
      values.add(hdg.turn);
    }
  }
  if (readback.speed && instruction.speed && readback.speed.valueKt !== instruction.speed.valueKt) {
    fields.add('speed');
    values.add(String(readback.speed.valueKt));
  }
  if (
    readback.approach &&
    instruction.approach &&
    readback.approach.runway !== instruction.approach.runway
  ) {
    fields.add('approach');
    values.add(readback.approach.runway);
  }
  if (
    readback.frequency &&
    instruction.frequency &&
    readback.frequency.mhz !== instruction.frequency.mhz
  ) {
    fields.add('frequency');
    values.add(readback.frequency.mhz);
  }
  return { values, fields };
}
