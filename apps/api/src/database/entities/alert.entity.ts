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

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  /** 'resolved' by the controller or 'cleared' when the condition went away. */
  @Column('text', { nullable: true })
  outcome: Alert['outcome'] | null;

  @Column({ name: 'end_reason', type: 'text', nullable: true })
  endReason: string | null;

  /** The controller who resolved it. */
  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;
}
