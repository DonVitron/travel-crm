
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest } from '../common/authenticated-request.js';

@Injectable()
export class OriginalAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    const originalAdminId =
      this.config.getOrThrow<string>('ORIGINAL_ADMIN_ID');

    if (
    !/^[1-9]\d*$/.test(originalAdminId) ||
    String(request.user?.id) !== originalAdminId ||
    request.user?.role !== 'admin'
    ) {
      throw new ForbiddenException(
        'Only the original administrator can manage users.',
      );
    }

    return true;
  }
}
