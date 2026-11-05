import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
import { LeadWorkflowScheduler } from './lead-workflow.scheduler.js';

@Module({
  imports: [
    AuthModule,
    ClientsModule,
  ],
  controllers: [LeadsController],
  providers: [LeadsService, LeadWorkflowScheduler],
  exports: [LeadsService],
})
export class LeadsModule {}