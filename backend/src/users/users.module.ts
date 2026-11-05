import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OriginalAdminGuard } from '../auth/original-admin.guard.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, OriginalAdminGuard],
  exports: [UsersService],
})
export class UsersModule {}