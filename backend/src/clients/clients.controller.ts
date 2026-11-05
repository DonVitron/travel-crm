import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/authenticated-request.js';
import { parseClientId } from '../common/parse-id.js';
import { parsePage } from '../common/pagination.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ClientsService } from './clients.service.js';

@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('page') pageParam?: string,
    @Query('search') searchParam?: string,
  ) {
    // Validate page first, then search, same order as before the refactor.
    const paging = parsePage(pageParam);
    const search = this.clientsService.normalizeSearch(searchParam);

    return this.clientsService.list(req.user, paging, search);
  }

  @Get(':id')
  getById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.clientsService.getById(req.user, parseClientId(id));
  }
}
