import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { LoginRequest, LoginResponse, User } from '@towerwhisper/shared';
import { AuthService, type AuthUser } from './auth.service';
import { CurrentUser, Public } from './decorators';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/login -> bearer token and the account. */
  @Post('login')
  @Public()
  @HttpCode(200)
  login(@Body() body: LoginRequest): Promise<LoginResponse> {
    return this.auth.login(body?.email, body?.password);
  }

  /** GET /api/auth/me — the account behind the token (role and sector as they are now). */
  @Get('me')
  me(@CurrentUser() user: AuthUser): User {
    return user;
  }
}
