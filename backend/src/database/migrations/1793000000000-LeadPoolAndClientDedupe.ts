import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 2: shared lead pool + client de-duplication.
 *
 * - leads.assigned_agent_id becomes nullable: NULL means "in the pool".
 * - leads.last_activity_at lets admins find claimed leads nobody is working.
 * - clients.phone_normalized allows reliable phone matching. Its value must
 *   follow normalizePhone() in src/common/contact.ts.
 */
export class LeadPoolAndClientDedupe1793000000000
  implements MigrationInterface
{
  name = 'LeadPoolAndClientDedupe1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE leads
        MODIFY assigned_agent_id BIGINT UNSIGNED NULL,
        ADD COLUMN last_activity_at TIMESTAMP NOT NULL
          DEFAULT CURRENT_TIMESTAMP,
        ADD KEY ix_leads_pool (assigned_agent_id, created_at),
        ADD KEY ix_leads_activity (last_activity_at)
    `);

    // Existing leads: treat the last update as their last activity.
    // `updated_at = updated_at` stops ON UPDATE CURRENT_TIMESTAMP from
    // overwriting the real update times while we copy them.
    await queryRunner.query(`
      UPDATE leads SET last_activity_at = updated_at, updated_at = updated_at
    `);

    await queryRunner.query(`
      ALTER TABLE clients
        ADD COLUMN phone_normalized VARCHAR(40) NULL,
        ADD KEY ix_clients_phone_normalized (phone_normalized)
    `);

    await queryRunner.query(`
      UPDATE clients
      SET phone_normalized = CASE
        WHEN REGEXP_REPLACE(phone, '[^0-9]', '') = '' THEN NULL
        ELSE CONCAT(
          IF(LEFT(TRIM(phone), 1) = '+', '+', ''),
          REGEXP_REPLACE(phone, '[^0-9]', '')
        )
      END
      WHERE phone IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS unclaimed FROM leads WHERE assigned_agent_id IS NULL`,
    )) as Array<{ unclaimed: number | string }>;

    const unclaimed = Number(rows[0]?.unclaimed ?? 0);

    if (unclaimed > 0) {
      throw new Error(
        `Cannot revert: ${unclaimed} unclaimed lead(s) are in the pool. ` +
          'Assign them to an agent first.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE clients
        DROP KEY ix_clients_phone_normalized,
        DROP COLUMN phone_normalized
    `);

    await queryRunner.query(`
      ALTER TABLE leads
        DROP KEY ix_leads_activity,
        DROP KEY ix_leads_pool,
        DROP COLUMN last_activity_at,
        MODIFY assigned_agent_id BIGINT UNSIGNED NOT NULL
    `);
  }
}
