import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() body: { email?: unknown; password?: unknown },
  ) {
    return this.authService.login(body?.email, body?.password);
  }
}
