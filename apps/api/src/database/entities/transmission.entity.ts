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

  @Column({ name: 'stt_latency_ms', type: 'integer', nullable: true })
  sttLatencyMs: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
