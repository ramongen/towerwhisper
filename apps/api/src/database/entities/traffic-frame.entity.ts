import type { Aircraft } from '@towerwhisper/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SessionEntity } from './session.entity';

/** One recorded radar picture of a session, for the supervisor's replay. */
@Entity('traffic_frames')
@Index(['sessionId', 'at'])
export class TrafficFrameEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session?: SessionEntity;

  @Column({ type: 'timestamptz' })
  at: Date;

  @Column('jsonb')
  aircraft: Aircraft[];
}
