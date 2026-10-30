import { Injectable } from '@nestjs/common';
import type { Aircraft, Clearance, FaultConfig } from '@towerwhisper/shared';
import { DEFAULT_ALTITUDE_OFFSET_FT } from '../demo/constants';
import { STEPPED_ON_MARK } from './constants';

type ReadbackFault = NonNullable<FaultConfig['readback']>;

export interface Readback {
  /** What the pilot says, e.g. 'Descend 3000, left heading 120, TAROM 301'. */
  text: string;
  /** Who says it (another aircraft for the wrong-callsign fault). */
  callsign: string;
  /** Whether the readback fault changed anything (it is consumed only then). */
  faultApplied: boolean;
}

/**
 * Builds the pilot readback from fixed templates, so the demo is deterministic. A readback
 * fault from the demo panel alters the template output; nothing else changes.
 */
@Injectable()
export class ReadbackBuilder {
  build(
    instruction: Clearance,
    aircraft: Aircraft[],
    fault: ReadbackFault | null,
    steppedOn = false,
  ): Readback | null {
    const own = aircraft.find((a) => a.callsign === instruction.callsign);
    if (!own) return null;
    if (fault?.kind === 'no_response') return null;

    const c: Clearance = structuredClone(instruction);
    let speaker = own;
    let faultApplied = false;

    switch (fault?.kind) {
      case 'wrong_altitude':
        if (c.altitude) {
          c.altitude.valueFt += fault.altitudeOffsetFt ?? DEFAULT_ALTITUDE_OFFSET_FT;
          faultApplied = true;
        }
        break;
      case 'wrong_heading':
        if (c.heading) {
          c.heading.valueDeg = transposedHeading(c.heading.valueDeg);
          faultApplied = true;
        }
        break;
      case 'wrong_turn':
        // Only a cleared direction can be read back wrong ('heading 120' has none).
        if (c.heading && c.heading.turn !== 'any') {
          c.heading.turn = c.heading.turn === 'left' ? 'right' : 'left';
          faultApplied = true;
        }
        break;
      case 'wrong_runway':
        if (c.approach) {
          c.approach.runway = c.approach.runway === '09' ? '27' : '09';
          faultApplied = true;
        }
        break;
      case 'wrong_callsign': {
        const other = aircraft.find((a) => a.callsign !== own.callsign);
        if (other) {
          speaker = other;
          faultApplied = true;
        }
        break;
      }
      case 'incomplete':
        if (c.altitude) delete c.altitude;
        else if (c.heading) delete c.heading;
        else if (c.speed) delete c.speed;
        else if (c.approach) delete c.approach;
        else if (c.direct) delete c.direct;
        else delete c.frequency;
        faultApplied = true;
        break;
    }

    const items = phrases(c);
    if (steppedOn) {
      // The end of the transmission (last item and callsign) is lost under the other carrier.
      const heard = items.slice(0, Math.max(0, items.length - 1));
      return {
        text: `${heard.join(', ')} ${STEPPED_ON_MARK}`.trim(),
        callsign: speaker.callsign,
        faultApplied,
      };
    }
    const text = [...items, speaker.telephony].join(', ');
    return { text: capitalize(text), callsign: speaker.callsign, faultApplied };
  }
}

/** Template phrases in readback order: altitude, heading, speed, approach, frequency. */
function phrases(c: Clearance): string[] {
  const items: string[] = [];
  if (c.altitude) {
    const verb = { climb: 'climb', descend: 'descend', maintain: 'maintain' }[c.altitude.action];
    const level = c.altitude.flightLevel
      ? `flight level ${c.altitude.valueFt / 100}`
      : `${c.altitude.valueFt}`;
    items.push(`${verb} ${level}`);
  }
  if (c.heading) {
    const hdg = String(c.heading.valueDeg).padStart(3, '0');
    items.push(c.heading.turn === 'any' ? `heading ${hdg}` : `${c.heading.turn} heading ${hdg}`);
  }
  if (c.speed) items.push(`speed ${c.speed.valueKt}`);
  if (c.approach) items.push(`cleared ILS runway ${c.approach.runway}`);
  if (c.direct) items.push(`direct ${c.direct.fix}`);
  if (c.frequency) items.push(c.frequency.mhz);
  return items.map((item, i) => (i === 0 ? capitalize(item) : item));
}

/** 120 -> 210 (first two digits swapped); falls back to +30° when that is not a heading. */
export function transposedHeading(deg: number): number {
  const s = String(deg).padStart(3, '0');
  const swapped = Number(s[1] + s[0] + s[2]);
  if (swapped >= 1 && swapped <= 360 && swapped !== deg) return swapped;
  return ((deg + 30 - 1) % 360) + 1;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
