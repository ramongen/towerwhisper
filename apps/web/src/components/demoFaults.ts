import type { FaultConfig } from '@towerwhisper/shared';

export type ReadbackKind = NonNullable<FaultConfig['readback']>['kind'];
export type ExecutionKind = NonNullable<FaultConfig['execution']>['kind'];

/** Demo-panel tiles, in panel order; keys 1-9 on the big screen arm the first nine. */
export const READBACK_FAULTS: { kind: ReadbackKind; label: string; tag: string }[] = [
  { kind: 'wrong_altitude', label: 'Wrong altitude', tag: 'HEARBACK MISMATCH' },
  { kind: 'wrong_heading', label: 'Wrong heading', tag: 'HEARBACK MISMATCH' },
  { kind: 'wrong_turn', label: 'Wrong turn direction', tag: 'HEARBACK MISMATCH' },
  { kind: 'wrong_runway', label: 'Wrong runway', tag: 'HEARBACK MISMATCH' },
  { kind: 'wrong_callsign', label: 'Wrong callsign', tag: 'HEARBACK MISMATCH' },
  { kind: 'incomplete', label: 'Incomplete readback', tag: 'READBACK INCOMPLETE' },
  { kind: 'no_response', label: 'No response', tag: 'NO RESPONSE' },
];

export const EXECUTION_FAULTS: { kind: ExecutionKind; label: string; tag: string }[] = [
  { kind: 'turn_wrong_way', label: 'Turn wrong way', tag: 'WRONG TURN' },
  { kind: 'level_bust', label: 'Level bust', tag: 'LEVEL BUST' },
  { kind: 'wrong_vertical', label: 'Wrong vertical', tag: 'WRONG VERTICAL' },
  { kind: 'ignore', label: 'Ignore instruction', tag: 'NON-CONFORMANCE' },
];

export const DEMO_LIMITS = { cautionS: 15, warningS: 30 };
export const REAL_LIMITS = { cautionS: 30 * 60, warningS: 60 * 60 };

/** Shortcut key -> fault, for the big screen (once mode). */
export const SHORTCUTS: (
  { kind: ReadbackKind; type: 'readback' } | { kind: ExecutionKind; type: 'execution' }
)[] = [
  ...READBACK_FAULTS.map((f) => ({ kind: f.kind, type: 'readback' as const })),
  { kind: 'turn_wrong_way', type: 'execution' },
  { kind: 'level_bust', type: 'execution' },
];
