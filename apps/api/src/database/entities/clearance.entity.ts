import type { Clearance } from '@towerwhisper/shared';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TransmissionEntity } from './transmission.entity';

@Entity('clearances')
export class ClearanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transmission_id', type: 'uuid' })
  transmissionId: string;

  @ManyToOne(() => TransmissionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transmission_id' })
  transmission?: TransmissionEntity;

  @Column('text')
  callsign: string;

  @Column('jsonb')
  payload: Clearance;

  @Column({ name: 'parse_path', type: 'text' })
  parsePath: Clearance['parsePath'];

  @Column('real')
  confidence: number;
}
