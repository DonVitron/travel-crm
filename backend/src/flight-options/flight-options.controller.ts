
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../common/authenticated-request.js';
import { FlightOptionsService } from './flight-options.service.js';

@UseGuards(JwtAuthGuard)
@Controller()
export class FlightOptionsController {
  constructor(
    private readonly flightOptionsService: FlightOptionsService,
  ) {}

  @Post('flight-requests/:id/options')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.flightOptionsService.create(
      request.user,
      String(id),
      body,
    );
  }

  @Get('flight-requests/:id/options')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.flightOptionsService.list(
      request.user,
      String(id),
    );
  }

  @Get('flight-options/:id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.flightOptionsService.findOption(
      request.user,
      String(id),
    );
  }

  @Patch('flight-options/:id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.flightOptionsService.update(
      request.user,
      String(id),
      body,
    );
  }
}
