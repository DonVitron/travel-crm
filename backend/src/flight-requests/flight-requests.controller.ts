
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../common/authenticated-request.js';
import { FlightRequestsService } from './flight-requests.service.js';

@UseGuards(JwtAuthGuard)
@Controller()
export class FlightRequestsController {
  constructor(
    private readonly flightRequestsService: FlightRequestsService,
  ) {}

  @Post('leads/:id/flight-requests')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.flightRequestsService.create(
      request.user,
      String(id),
      body,
    );
  }

  @Get('leads/:id/flight-requests')
  listByLead(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.flightRequestsService.listByLead(
      request.user,
      String(id),
    );
  }

  @Get('flight-requests/:id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.flightRequestsService.findOne(
      request.user,
      String(id),
    );
  }
}
