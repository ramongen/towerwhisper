import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SessionEntity } from './session.entity';

@Entity('transmissions')
export class TransmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session?: SessionEntity;

  @Column('text')
  speaker: 'atc' | 'pilot';

  @Column({ name: 'audio_path', type: 'text', nullable: true })
  audioPath: string | null;

  @Column('text')
  transcript: string;

  /** The aircraft (pilot calls; the parsed callsign for ATC). */
  @Column('text', { nullable: true })
  callsign: string | null;

  /** The controller who transmitted (ATC transmissions). */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  /** The comms entry as broadcast, for the replay. */
  @Column('jsonb', { nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ name: 'stt_latency_ms', type: 'integer', nullable: true })
  sttLatencyMs: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
