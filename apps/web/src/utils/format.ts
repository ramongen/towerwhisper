import type { Aircraft, Alert, Clearance } from '@towerwhisper/shared';

/** 515 -> '08:35' (minutes can exceed 59: '31:05'). */
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 7000 ft -> '070' (hundreds of feet, as on a radar data block). */
export function level(altitudeFt: number): string {
  return String(Math.round(altitudeFt / 100)).padStart(3, '0');
}

export function heading(deg: number): string {
  return String(Math.round(deg) % 360 || 360).padStart(3, '0');
}

/** '050 ↓ 030', '120 = 120' — current level, trend, cleared level. */
export function levelLine(
  a: Aircraft,
  arrows: { up: string; down: string; level: string },
): string {
  const target = a.target.altitudeFt ?? a.altitudeFt;
  const trend =
    a.verticalSpeedFpm > 200 ? arrows.up : a.verticalSpeedFpm < -200 ? arrows.down : arrows.level;
  return `${level(a.altitudeFt)} ${trend} ${level(target)}`;
}

/** Time of day in UTC, '14:33:07'. */
export function utcTime(date: Date | string | number): string {
  return new Date(date).toISOString().slice(11, 19);
}

/** 'HEARBACK_MISMATCH' -> 'HEARBACK MISMATCH' */
export function alertLabel(type: Alert['type']): string {
  return type.replace(/_/g, ' ');
}

/** '3 s ago', '2 min ago' */
export function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`;
}

export interface ChipData {
  key: keyof Pick<
    Clearance,
    'altitude' | 'heading' | 'speed' | 'approach' | 'frequency' | 'direct'
  >;
  text: string;
}

/** Parsed instruction as compact chips: 'ALT 3000 ↓', 'FL120 =', 'HDG 120 L', 'SPD 220', 'ILS 26'. */
export function chips(c: Clearance | null): ChipData[] {
  if (!c) return [];
  const out: ChipData[] = [];
  if (c.altitude) {
    const arrow = { climb: '↑', descend: '↓', maintain: '=' }[c.altitude.action];
    const value = c.altitude.flightLevel
      ? `FL${String(c.altitude.valueFt / 100).padStart(3, '0')}`
      : `ALT ${c.altitude.valueFt}`;
    out.push({ key: 'altitude', text: `${value} ${arrow}` });
  }
  if (c.heading) {
    const turn = c.heading.turn === 'any' ? '' : ` ${c.heading.turn === 'left' ? 'L' : 'R'}`;
    out.push({ key: 'heading', text: `HDG ${heading(c.heading.valueDeg)}${turn}` });
  }
  if (c.speed) out.push({ key: 'speed', text: `SPD ${c.speed.valueKt}` });
  if (c.approach) out.push({ key: 'approach', text: `${c.approach.type} ${c.approach.runway}` });
  if (c.direct) out.push({ key: 'direct', text: `DCT ${c.direct.fix}` });
  if (c.frequency) out.push({ key: 'frequency', text: `FREQ ${c.frequency.mhz}` });
  return out;
}
