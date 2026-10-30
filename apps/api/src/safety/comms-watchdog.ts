import { Injectable } from '@nestjs/common';
import type { Aircraft, FaultConfig } from '@towerwhisper/shared';
import { AlertRegistry, alertKey } from './alert-registry';

/**
 * Runs every tick: NO_CONTACT caution at the first limit, upgraded (same alert) to warning
 * at the second, cleared on the next transmission to or from the aircraft. The age comes
 * from the simulation clock, so it follows the demo time scale.
 */
@Injectable()
export class CommsWatchdog {
  constructor(private readonly alerts: AlertRegistry) {}

  tick(aircraft: Aircraft[], limits: FaultConfig['commsLimits']): void {
    const present = new Set(aircraft.map((a) => a.callsign));
    this.alerts.clearWhere(
      (key, alert) => alert.type === 'NO_CONTACT' && !present.has(alert.callsigns[0]),
      'aircraft left the scope',
    );

    for (const a of aircraft) {
      const key = alertKey('NO_CONTACT', a.callsign);
      const age = a.commsAgeS;
      if (age < limits.cautionS) {
        this.alerts.clear(key, 'transmission with the aircraft');
        continue;
      }
      const warning = age >= limits.warningS;
      const limit = warning ? limits.warningS : limits.cautionS;
      this.alerts.raise(key, {
        type: 'NO_CONTACT',
        severity: warning ? 'warning' : 'caution',
        callsigns: [a.callsign],
        message: `No communication with ${a.callsign} for ${duration(age, limit)} (limit ${duration(limit, limit)})`,
        details: { commsAgeS: age, limitS: limit, lastContactAt: a.lastContactAt },
      });
    }
  }
}

/** Minutes for real limits ('31 min'), seconds for the demo limits ('31 s'). */
export function duration(seconds: number, limitS: number): string {
  return limitS < 120 ? `${Math.floor(seconds)} s` : `${Math.floor(seconds / 60)} min`;
}
