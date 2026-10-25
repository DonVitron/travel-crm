import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/authenticated-request.js';
import { parseLeadId } from '../common/parse-id.js';
import { parsePage } from '../common/pagination.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { LeadFieldsBody } from './lead-fields.js';
import { LeadsService } from './leads.service.js';

@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  // Declared before any `:id` route so "count" is never read as an id.
  @Get('count')
  count(@Req() req: AuthenticatedRequest) {
    return this.leadsService.count(req.user);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('page') pageParam?: string) {
    return this.leadsService.list(req.user, parsePage(pageParam));
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: LeadFieldsBody) {
    return this.leadsService.create(req.user, body);
  }

  @Patch(':id')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: unknown },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.leadsService.updateStatus(req.user, parseLeadId(id), body?.status);
  }

  @Patch(':id/details')
  updateDetails(
    @Param('id') id: string,
    @Body() body: LeadFieldsBody,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.leadsService.updateDetails(req.user, parseLeadId(id), body);
  }
}
