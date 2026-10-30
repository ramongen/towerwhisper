import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SessionEntity } from './session.entity';

@Entity('fault_events')
export class FaultEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session?: SessionEntity;

  @Column({ name: 'fault_type', type: 'text' })
  faultType: string;

  @Column('text', { nullable: true })
  callsign: string | null;

  @Column('jsonb')
  config: Record<string, unknown>;

  @Column({ name: 'triggered_at', type: 'timestamptz' })
  triggeredAt: Date;
}
