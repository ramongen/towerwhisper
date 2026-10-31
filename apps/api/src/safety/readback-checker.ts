import { Injectable } from '@nestjs/common';
import type { Clearance, ReadbackCheck } from '@towerwhisper/shared';
import { AlertRegistry, alertKey } from './alert-registry';
import { NO_RESPONSE_AFTER_S } from './constants';

export interface ReadbackResult {
  check: ReadbackCheck;
  /** Human-readable differences, e.g. 'cleared 3000 ft, read back 5000 ft'. */
  mismatches: string[];
  /** Instruction items the pilot did not read back, e.g. 'speed 220 kt'. */
  missing: string[];
}

interface PendingReadback {
  instruction: Clearance;
  issuedAtMs: number;
}

/**
 * Compares a parsed readback with the instruction it answers, and raises
 * HEARBACK_MISMATCH (red), READBACK_INCOMPLETE (amber) or, from tick(), NO_RESPONSE (amber).
 */
@Injectable()
export class ReadbackChecker {
  private readonly pending = new Map<string, PendingReadback>();

  constructor(private readonly alerts: AlertRegistry) {}

  /** The controller issued an instruction: a readback is now expected from that aircraft. */
  expect(instruction: Clearance, simNowMs: number): void {
    this.pending.set(instruction.callsign, { instruction, issuedAtMs: simNowMs });
    // A new instruction supersedes the previous exchange with this aircraft.
    this.alerts.clear(alertKey('NO_RESPONSE', instruction.callsign), 'new instruction');
  }

  /** The instruction a readback from `callsign` answers (or, for a wrong callsign, the latest one). */
  pendingFor(callsign: string): Clearance | null {
    const own = this.pending.get(callsign);
    if (own) return own.instruction;
    let latest: PendingReadback | null = null;
    for (const p of this.pending.values()) {
      if (!latest || p.issuedAtMs > latest.issuedAtMs) latest = p;
    }
    return latest?.instruction ?? null;
  }

  /**
   * Checks a readback against its instruction and raises the matching alert.
   * `readback` is null when the pilot's words could not be parsed at all.
   */
  check(
    instruction: Clearance,
    readback: Clearance | null,
    readbackCallsign: string,
  ): ReadbackResult {
    this.pending.delete(instruction.callsign);
    const result = compare(instruction, readback, readbackCallsign);
    const cs = instruction.callsign;
    const details = {
      instruction,
      readback,
      mismatches: result.mismatches,
      missing: result.missing,
    };

    if (result.check === 'mismatch') {
      this.alerts.raise(alertKey('HEARBACK_MISMATCH', cs), {
        type: 'HEARBACK_MISMATCH',
        severity: 'warning',
        callsigns: readbackCallsign !== cs ? [cs, readbackCallsign] : [cs],
        message: `${cs} ${result.mismatches.join('; ')}`,
        details,
      });
    } else if (result.check === 'incomplete') {
      const heard = describe(readback).filter((item) => !result.missing.includes(item));
      this.alerts.raise(alertKey('READBACK_INCOMPLETE', cs), {
        type: 'READBACK_INCOMPLETE',
        severity: 'caution',
        callsigns: [cs],
        message: heard.length
          ? `${cs} read back ${heard.join(', ')}; ${result.missing.join(', ')} missing`
          : `${cs} readback missing ${result.missing.join(', ')}`,
        details,
      });
    } else {
      // A correct readback closes the earlier readback problems with this aircraft.
      this.alerts.clearWhere(
        (_key, a) =>
          a.callsigns[0] === cs &&
          (a.type === 'HEARBACK_MISMATCH' ||
            a.type === 'READBACK_INCOMPLETE' ||
            a.type === 'NO_RESPONSE'),
        'correct readback received',
      );
    }
    return result;
  }

  /** Every tick: NO_RESPONSE for instructions without a readback after 8 s (simulation time). */
  tick(simNowMs: number): void {
    for (const [callsign, p] of [...this.pending]) {
      const waitedS = (simNowMs - p.issuedAtMs) / 1000;
      if (waitedS < NO_RESPONSE_AFTER_S) continue;
      this.pending.delete(callsign);
      this.alerts.raise(alertKey('NO_RESPONSE', callsign), {
        type: 'NO_RESPONSE',
        severity: 'caution',
        callsigns: [callsign],
        message: `No readback from ${callsign} ${NO_RESPONSE_AFTER_S} s after: ${describe(p.instruction).join(', ')}`,
        details: { instruction: p.instruction, waitedS: NO_RESPONSE_AFTER_S },
      });
    }
  }

  reset(): void {
    this.pending.clear();
  }
}

/** Pure comparison, field by field. */
export function compare(
  instruction: Clearance,
  readback: Clearance | null,
  readbackCallsign: string,
): ReadbackResult {
  const mismatches: string[] = [];
  const missing: string[] = [];

  if (readbackCallsign !== instruction.callsign) {
    mismatches.push(`instruction read back by ${readbackCallsign}`);
  }

  const i = instruction;
  const r = readback ?? ({} as Partial<Clearance>);

  if (i.altitude) {
    if (!r.altitude) missing.push(altitudeText(i.altitude));
    else if (r.altitude.valueFt !== i.altitude.valueFt) {
      mismatches.push(`cleared ${altitudeText(i.altitude)}, read back ${altitudeText(r.altitude)}`);
    }
  }
  if (i.heading) {
    if (!r.heading) missing.push(`heading ${hdg(i.heading.valueDeg)}`);
    else if (r.heading.valueDeg !== i.heading.valueDeg) {
      mismatches.push(
        `cleared heading ${hdg(i.heading.valueDeg)}, read back ${hdg(r.heading.valueDeg)}`,
      );
    } else if (
      i.heading.turn !== 'any' &&
      r.heading.turn !== 'any' &&
      r.heading.turn !== i.heading.turn
    ) {
      mismatches.push(
        `cleared ${i.heading.turn.toUpperCase()} heading ${hdg(i.heading.valueDeg)}, read back ${r.heading.turn.toUpperCase()}`,
      );
    }
  }
  if (i.speed) {
    if (!r.speed) missing.push(`speed ${i.speed.valueKt} kt`);
    else if (r.speed.valueKt !== i.speed.valueKt) {
      mismatches.push(`cleared speed ${i.speed.valueKt} kt, read back ${r.speed.valueKt} kt`);
    }
  }
  if (i.approach) {
    if (!r.approach) missing.push(`${i.approach.type} ${i.approach.runway}`);
    else if (r.approach.runway !== i.approach.runway) {
      mismatches.push(
        `cleared ${i.approach.type} runway ${i.approach.runway}, read back runway ${r.approach.runway}`,
      );
    }
  }
  if (i.frequency) {
    if (!r.frequency) missing.push(`frequency ${i.frequency.mhz}`);
    else if (r.frequency.mhz !== i.frequency.mhz) {
      mismatches.push(`cleared frequency ${i.frequency.mhz}, read back ${r.frequency.mhz}`);
    }
  }

  if (i.direct) {
    if (!r.direct) missing.push(`direct ${i.direct.fix}`);
    else if (r.direct.fix !== i.direct.fix) {
      mismatches.push(`cleared direct ${i.direct.fix}, read back ${r.direct.fix}`);
    }
  }
  if (i.landing) {
    if (!r.landing) missing.push(landingText(i.landing));
    else if (i.landing.runway && r.landing.runway && r.landing.runway !== i.landing.runway) {
      mismatches.push(
        `cleared to land runway ${i.landing.runway}, read back runway ${r.landing.runway}`,
      );
    }
  }
  if (i.goAround && !r.goAround) missing.push('go around');

  const check: ReadbackCheck = mismatches.length
    ? 'mismatch'
    : missing.length
      ? 'incomplete'
      : 'ok';
  return { check, mismatches, missing };
}

/** The instruction items as text, in the same words the alerts use. */
export function describe(c: Clearance | null): string[] {
  if (!c) return [];
  const items: string[] = [];
  if (c.altitude) items.push(altitudeText(c.altitude));
  if (c.heading) items.push(`heading ${hdg(c.heading.valueDeg)}`);
  if (c.speed) items.push(`speed ${c.speed.valueKt} kt`);
  if (c.approach) items.push(`${c.approach.type} ${c.approach.runway}`);
  if (c.frequency) items.push(`frequency ${c.frequency.mhz}`);
  if (c.direct) items.push(`direct ${c.direct.fix}`);
  if (c.landing) items.push(landingText(c.landing));
  if (c.goAround) items.push('go around');
  return items;
}

function altitudeText(alt: NonNullable<Clearance['altitude']>): string {
  return alt.flightLevel ? `FL${String(alt.valueFt / 100).padStart(3, '0')}` : `${alt.valueFt} ft`;
}

function landingText(landing: NonNullable<Clearance['landing']>): string {
  return landing.runway ? `cleared to land runway ${landing.runway}` : 'cleared to land';
}

function hdg(deg: number): string {
  return String(deg).padStart(3, '0');
}
