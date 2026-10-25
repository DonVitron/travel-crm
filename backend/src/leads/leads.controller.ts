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
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../common/authenticated-request.js';
import { parsePage } from '../common/pagination.js';
import { parseLeadId } from '../common/parse-id.js';
import type { LeadFieldsBody } from './lead-fields.js';
import { LeadsService } from './leads.service.js';
import { parseStaleHours } from './stale-hours.js';

@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  // Fixed paths (count, pool, stale) are declared before any `:id` route.

  @Get('count')
  count(@Req() req: AuthenticatedRequest) {
    return this.leadsService.count(req.user);
  }

  /** Unclaimed leads that any agent can claim. */
  @Get('pool')
  pool(@Query('page') pageParam?: string) {
    return this.leadsService.listPool(parsePage(pageParam));
  }

  /** Claimed leads nobody has touched for `hours` (default 24). Admin only. */
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('stale')
  stale(
    @Query('hours') hoursParam?: string,
    @Query('page') pageParam?: string,
  ) {
    return this.leadsService.listStale(
      parseStaleHours(hoursParam),
      parsePage(pageParam),
    );
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('page') pageParam?: string) {
    return this.leadsService.list(req.user, parsePage(pageParam));
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: LeadFieldsBody) {
    return this.leadsService.create(req.user, body);
  }

  @Post(':id/claim')
  claim(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.leadsService.claim(req.user, parseLeadId(id));
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post(':id/release')
  release(@Param('id') id: string) {
    return this.leadsService.release(parseLeadId(id));
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post(':id/reassign')
  reassign(@Param('id') id: string, @Body() body: { agentId?: unknown }) {
    return this.leadsService.reassign(parseLeadId(id), body?.agentId);
  }

  @Patch(':id')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: unknown },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.leadsService.updateStatus(
      req.user,
      parseLeadId(id),
      body?.status,
    );
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
