import { AlertEntity } from './alert.entity';
import { ClearanceEntity } from './clearance.entity';
import { FaultEventEntity } from './fault-event.entity';
import { SessionEntity } from './session.entity';
import { TrafficFrameEntity } from './traffic-frame.entity';
import { TransmissionEntity } from './transmission.entity';
import { UserEntity } from './user.entity';

export {
  AlertEntity,
  ClearanceEntity,
  FaultEventEntity,
  SessionEntity,
  TrafficFrameEntity,
  TransmissionEntity,
  UserEntity,
};

export const ENTITIES = [
  SessionEntity,
  TransmissionEntity,
  ClearanceEntity,
  AlertEntity,
  FaultEventEntity,
  TrafficFrameEntity,
  UserEntity,
];
