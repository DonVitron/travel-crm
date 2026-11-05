
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
import { QuotesService } from './quotes.service.js';

@UseGuards(JwtAuthGuard)
@Controller()
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post('leads/:id/quotes')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.quotesService.create(
      request.user,
      String(id),
      body,
    );
  }

  @Get('leads/:id/quotes')
  listByLead(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.quotesService.listByLead(
      request.user,
      String(id),
    );
  }

  @Get('quotes/:id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.quotesService.findOne(
      request.user,
      String(id),
    );
  }
}
