import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type {
  CreateUserRequest,
  UpdateUserRequest,
  User,
  UserListItem,
} from '@towerwhisper/shared';
import { AuthService, type AuthUser } from '../auth/auth.service';
import { CurrentUser, Roles } from '../auth/decorators';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Account management, for supervisors: create, change role or sector, reset a password. */
@Roles('supervisor')
@Controller('users')
export class UsersController {
  constructor(
    private readonly auth: AuthService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get()
  async list(): Promise<UserListItem[]> {
    const online = this.realtime.onlineUserIds();
    return (await this.auth.list()).map((u) => ({ ...u, online: online.has(u.id) }));
  }

  @Post()
  create(@Body() body: CreateUserRequest): Promise<User> {
    return this.auth.create(body);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserRequest,
    @CurrentUser() by: AuthUser,
  ): Promise<User> {
    const user = await this.auth.update(id, body ?? {}, by);
    this.realtime.refreshUser(id, user);
    return user;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() by: AuthUser): Promise<void> {
    await this.auth.remove(id, by);
    this.realtime.refreshUser(id, null);
  }
}
