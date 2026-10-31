import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@towerwhisper/shared';
import type { AuthUser } from './auth.service';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** No login needed (health, login, the demo panel, audio files). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Only these roles may call the route. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

export interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

/** The logged-in user (undefined on public routes called without a token). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
