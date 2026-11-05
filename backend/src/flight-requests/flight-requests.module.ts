
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FlightRequestsController } from './flight-requests.controller.js';
import { FlightRequestsService } from './flight-requests.service.js';

@Module({
  imports: [AuthModule],
  controllers: [FlightRequestsController],
  providers: [FlightRequestsService],
  exports: [FlightRequestsService],
})
export class FlightRequestsModule {}
