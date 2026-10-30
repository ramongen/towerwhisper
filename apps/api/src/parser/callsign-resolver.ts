import { Injectable } from '@nestjs/common';
import type { Clearance } from '@towerwhisper/shared';
import { CALLSIGN_MAX_NAME_DISTANCE } from './constants';

/** What the resolver needs to know about an aircraft in the session. */
export interface CallsignCandidate {
  callsign: string; // 'ROT301'
  telephony: string; // 'TAROM 301'
}

export interface ResolvedCallsign {
  callsign: string;
  /** true when the callsign was heard in the phrase, false when it came from the radar selection. */
  heard: boolean;
}

/**
 * Finds the addressed aircraft in a normalised phrase. Matching is fuzzy on the airline
 * name (Levenshtein <= 2, so 'tarum 301' still works) and exact on the digits, and only
 * against aircraft currently in the session. Controllers say the callsign first, pilots
 * last, so the earliest / latest match wins. Falls back to the aircraft selected on the radar.
 */
@Injectable()
export class CallsignResolver {
  resolve(
    normalized: string,
    speaker: Clearance['speaker'],
    candidates: CallsignCandidate[],
    selectedCallsign?: string | null,
  ): ResolvedCallsign | null {
    const tokens = normalized.split(' ');
    const matches: { callsign: string; position: number }[] = [];

    for (const candidate of candidates) {
      const { name, designator } = this.split(candidate.telephony);
      const nameWords = name.split(' ').length;

      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] !== designator) continue;
        const spokenName = tokens.slice(Math.max(0, i - nameWords), i).join(' ');
        if (spokenName && levenshtein(spokenName, name) <= CALLSIGN_MAX_NAME_DISTANCE) {
          matches.push({ callsign: candidate.callsign, position: i });
        }
      }
    }

    if (matches.length > 0) {
      matches.sort((a, b) => a.position - b.position);
      const pick = speaker === 'atc' ? matches[0] : matches[matches.length - 1];
      return { callsign: pick.callsign, heard: true };
    }

    // The designator alone, if exactly one aircraft has it ('... 301, descend ...')
    const byDesignator = candidates.filter((c) =>
      tokens.includes(this.split(c.telephony).designator),
    );
    if (byDesignator.length === 1) return { callsign: byDesignator[0].callsign, heard: true };

    if (selectedCallsign && candidates.some((c) => c.callsign === selectedCallsign)) {
      return { callsign: selectedCallsign, heard: false };
    }
    return null;
  }

  /** 'LUFTHANSA 9TC' -> { name: 'lufthansa', designator: '9tc' }; 'BLUE AIR 12' -> 'blue air' / '12'. */
  private split(telephony: string): { name: string; designator: string } {
    const words = telephony.toLowerCase().split(/\s+/);
    return { name: words.slice(0, -1).join(' '), designator: words[words.length - 1] };
  }
}

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
