
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FlightOptionsController } from './flight-options.controller.js';
import { FlightOptionsService } from './flight-options.service.js';

@Module({
  imports: [AuthModule],
  controllers: [FlightOptionsController],
  providers: [FlightOptionsService],
  exports: [FlightOptionsService],
})
export class FlightOptionsModule {}
