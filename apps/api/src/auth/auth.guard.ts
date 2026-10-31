import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@towerwhisper/shared';
import { AuthService } from './auth.service';
import { IS_PUBLIC, ROLES, type AuthedRequest } from './decorators';

/**
 * Global guard: every REST route needs a valid bearer token unless marked @Public();
 * @Roles() narrows it further. Public routes still get req.user when a token is sent.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
    request.user = (await this.auth.authenticate(token)) ?? undefined;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (!request.user) throw new UnauthorizedException('Please log in');
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(request.user.role)) {
      throw new ForbiddenException('Not allowed for your role');
    }
    return true;
  }
}
