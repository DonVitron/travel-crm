import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OriginalAdminGuard } from '../auth/original-admin.guard.js';
import { UsersService } from './users.service.js';

@UseGuards(JwtAuthGuard, OriginalAdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query('search') search?: string) {
    return this.usersService.findAll(search);
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.usersService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.usersService.update(String(id), body);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status?: unknown },
  ) {
    return this.usersService.updateStatus(
      String(id),
      body.status,
    );
  }

  @Patch(':id/password')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { password?: unknown },
  ) {
    return this.usersService.resetPassword(
      String(id),
      body.password,
    );
  }
}