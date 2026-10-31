import type { UserRole } from '@towerwhisper/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stored lower-case. */
  @Column('text', { unique: true })
  email: string;

  @Column('text')
  name: string;

  /** scrypt: 'salt:hash', both hex. */
  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @Column('text')
  role: UserRole;

  /** The sector an ATC works (src/sectors/sectors.ts); null for supervisors. */
  @Column({ name: 'sector_id', type: 'text', nullable: true })
  sectorId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;
}
