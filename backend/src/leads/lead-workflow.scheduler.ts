
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

@Injectable()
export class LeadWorkflowScheduler {
  private readonly logger = new Logger(LeadWorkflowScheduler.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Every minute, advance assigned leads that have been in New
   * for at least eight hours since their first assignment.
   */
  @Cron('* * * * *')
  async advanceExpiredNewLeads(): Promise<void> {
    try {
      const result = (await this.dataSource.query(`
        UPDATE leads
        SET workflow_status = 'processing',
            last_activity_at = NOW()
        WHERE workflow_status = 'new'
          AND assigned_agent_id IS NOT NULL
          AND original_assigned_at IS NOT NULL
          AND original_assigned_at <= DATE_SUB(NOW(), INTERVAL 8 HOUR)
          AND deleted_at IS NULL
      `)) as { affectedRows?: number };

      if (result?.affectedRows) {
        this.logger.log(
          `Moved ${result.affectedRows} lead(s) to Processing.`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to advance expired leads to Processing.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
