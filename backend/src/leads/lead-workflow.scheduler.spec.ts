
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { LeadWorkflowScheduler } from './lead-workflow.scheduler.js';

describe('LeadWorkflowScheduler', () => {
  let scheduler: LeadWorkflowScheduler;
  let dataSource: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    dataSource = {
      query: vi.fn().mockResolvedValue({ affectedRows: 0 }),
    };

    scheduler = new LeadWorkflowScheduler(
      dataSource as unknown as DataSource,
    );
  });

  it('moves only eligible New leads to Processing', async () => {
    await scheduler.advanceExpiredNewLeads();

    expect(dataSource.query).toHaveBeenCalledOnce();

    const [sql] = dataSource.query.mock.calls[0] as [string];

    expect(sql).toContain("workflow_status = 'new'");
    expect(sql).toContain("workflow_status = 'processing'");
    expect(sql).toContain('assigned_agent_id IS NOT NULL');
    expect(sql).toContain('original_assigned_at IS NOT NULL');
    expect(sql).toContain('INTERVAL 8 HOUR');
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('does not fail when no leads qualify', async () => {
    dataSource.query.mockResolvedValue({ affectedRows: 0 });

    await expect(
      scheduler.advanceExpiredNewLeads(),
    ).resolves.toBeUndefined();
  });

  it('handles a database error without crashing the scheduler', async () => {
    dataSource.query.mockRejectedValue(new Error('Database unavailable'));

    await expect(
      scheduler.advanceExpiredNewLeads(),
    ).resolves.toBeUndefined();
  });
});
