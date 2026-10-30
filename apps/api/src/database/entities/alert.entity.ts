import type { Alert, AlertType } from '@towerwhisper/shared';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SessionEntity } from './session.entity';

@Entity('alerts')
export class AlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session?: SessionEntity;

  @Column('text')
  type: AlertType;

  @Column('text')
  severity: Alert['severity'];

  @Column('text', { array: true })
  callsigns: string[];

  @Column('text')
  message: string;

  @Column('jsonb')
  details: Record<string, unknown>;

  @Column({ name: 'raised_at', type: 'timestamptz' })
  raisedAt: Date;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;
}
