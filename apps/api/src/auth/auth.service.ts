import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  CreateUserRequest,
  LoginResponse,
  UpdateUserRequest,
  User,
  UserRole,
} from '@towerwhisper/shared';
import type { Repository } from 'typeorm';
import { UserEntity } from '../database/entities';
import { isSectorId } from '../sectors/sectors';
import {
  DEFAULT_PASSWORD,
  DEV_AUTH_SECRET,
  MIN_PASSWORD_LENGTH,
  SEED_USERS,
  TOKEN_TTL_S,
} from './constants';
import { hashPassword, verifyPassword } from './password';
import { signToken, verifyToken } from './token';

/** The user behind a request or a socket. */
export type AuthUser = User;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: UserRole[] = ['atc', 'supervisor'];

/**
 * Accounts and login. Passwords are scrypt hashes; tokens are HMAC-signed and carry only the
 * user id, so a role or sector changed by the supervisor applies on the next request.
 * On the first run (no users yet) the two default accounts are created.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;

  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    config: ConfigService,
  ) {
    const secret = config.get<string>('AUTH_SECRET')?.trim();
    this.secret = secret || DEV_AUTH_SECRET;
    if (!secret) this.logger.warn('AUTH_SECRET not set: using the development secret');
  }

  async onModuleInit(): Promise<void> {
    try {
      if ((await this.users.count()) > 0) return;
      for (const seed of SEED_USERS) {
        await this.users.insert({
          ...seed,
          passwordHash: await hashPassword(DEFAULT_PASSWORD),
          lastLoginAt: null,
        });
      }
      this.logger.log(`First run: created ${SEED_USERS.map((u) => u.email).join(', ')}`);
    } catch (error) {
      this.logger.error(`Default accounts not created: ${(error as Error).message}`);
    }
  }

  async login(email: unknown, password: unknown): Promise<LoginResponse> {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('Email and password are required');
    }
    const row = await this.users.findOneBy({ email: email.trim().toLowerCase() });
    if (!row || !(await verifyPassword(password, row.passwordHash))) {
      throw new UnauthorizedException('Wrong email or password');
    }
    row.lastLoginAt = new Date();
    await this.users.update(row.id, { lastLoginAt: row.lastLoginAt });
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_S;
    return {
      token: signToken({ sub: row.id, exp }, this.secret),
      expiresAt: new Date(exp * 1000).toISOString(),
      user: toUser(row),
    };
  }

  /** The user of a bearer token, or null (bad signature, expired, account deleted). */
  async authenticate(token: string | undefined | null): Promise<AuthUser | null> {
    if (!token) return null;
    const claims = verifyToken(token, this.secret);
    if (!claims) return null;
    try {
      const row = await this.users.findOneBy({ id: claims.sub });
      return row ? toUser(row) : null;
    } catch {
      return null;
    }
  }

  async list(): Promise<User[]> {
    const rows = await this.users.find({ order: { role: 'DESC', name: 'ASC' } });
    return rows.map(toUser);
  }

  async create(body: CreateUserRequest): Promise<User> {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!EMAIL.test(email)) throw new BadRequestException('A valid email is required');
    if (!name) throw new BadRequestException('A name is required');
    checkPassword(body.password);
    const role = checkRole(body.role);
    const sectorId = checkSector(role, body.sectorId);
    if (await this.users.existsBy({ email })) {
      throw new ConflictException(`${email} already has an account`);
    }
    const row = await this.users.save(
      this.users.create({
        email,
        name,
        role,
        sectorId,
        passwordHash: await hashPassword(body.password),
        lastLoginAt: null,
      }),
    );
    this.logger.log(`Account created: ${email} (${role}${sectorId ? `, ${sectorId}` : ''})`);
    return toUser(row);
  }

  async update(id: string, body: UpdateUserRequest, by: AuthUser): Promise<User> {
    const row = await this.users.findOneBy({ id });
    if (!row) throw new NotFoundException('No such account');
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new BadRequestException('A name is required');
      row.name = name;
    }
    if (body.role !== undefined) {
      const role = checkRole(body.role);
      if (row.id === by.id && role !== 'supervisor') {
        throw new ForbiddenException('You cannot take the supervisor role from yourself');
      }
      row.role = role;
    }
    if (body.sectorId !== undefined || body.role !== undefined) {
      row.sectorId = checkSector(
        row.role,
        body.sectorId !== undefined ? body.sectorId : row.sectorId,
      );
    }
    if (body.password !== undefined) {
      checkPassword(body.password);
      row.passwordHash = await hashPassword(body.password);
    }
    await this.users.save(row);
    return toUser(row);
  }

  async remove(id: string, by: AuthUser): Promise<void> {
    if (id === by.id) throw new ForbiddenException('You cannot delete your own account');
    const result = await this.users.delete(id);
    if (!result.affected) throw new NotFoundException('No such account');
  }
}

function toUser(row: UserEntity): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    sectorId: row.sectorId,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

function checkPassword(password: unknown): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

function checkRole(role: unknown): UserRole {
  if (!ROLES.includes(role as UserRole))
    throw new BadRequestException('Role must be atc or supervisor');
  return role as UserRole;
}

/** Supervisors have no sector; an ATC needs a known one (or none yet). */
function checkSector(role: UserRole, sectorId: unknown): string | null {
  if (role === 'supervisor' || sectorId === null || sectorId === '' || sectorId === undefined) {
    return null;
  }
  if (!isSectorId(sectorId)) throw new BadRequestException(`Unknown sector ${String(sectorId)}`);
  return sectorId;
}
