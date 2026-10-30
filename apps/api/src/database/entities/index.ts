import { AlertEntity } from './alert.entity';
import { ClearanceEntity } from './clearance.entity';
import { FaultEventEntity } from './fault-event.entity';
import { SessionEntity } from './session.entity';
import { TransmissionEntity } from './transmission.entity';

export { AlertEntity, ClearanceEntity, FaultEventEntity, SessionEntity, TransmissionEntity };

export const ENTITIES = [
  SessionEntity,
  TransmissionEntity,
  ClearanceEntity,
  AlertEntity,
  FaultEventEntity,
];
