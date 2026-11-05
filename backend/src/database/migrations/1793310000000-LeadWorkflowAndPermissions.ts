/**
 * Adds the schema foundation for the new lead workflow.
 *
 * Legacy leads.status remains unchanged.
 * Assigned leads are backfilled into workflow_status based on
 * existing quotes and the available assignment timestamp.
 * Unassigned leads retain workflow_status = NULL.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LeadWorkflowAndPermissions1793310000000
  implements MigrationInterface
{
  name = 'LeadWorkflowAndPermissions1793310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Managers remain agents with an additional permission.
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN department VARCHAR(80) NULL,
        ADD COLUMN is_manager TINYINT(1) NOT NULL DEFAULT 0
    `);

    // Preserve historical statuses; never assume existing leads are new.
    await queryRunner.query(`
      ALTER TABLE leads
        MODIFY COLUMN cabin_class ENUM(
          'economy',
          'premium_economy',
          'business',
          'first_class'
        ) NULL,
        ADD COLUMN travel_type ENUM(
          'round_trip',
          'one_way',
          'multi_city'
        ) NULL,
        ADD COLUMN workflow_status ENUM(
          'new',
          'processing',
          'sold',
          'closed'
        ) NULL DEFAULT NULL,
        ADD COLUMN original_assigned_at TIMESTAMP NULL,
        ADD COLUMN deleted_at TIMESTAMP NULL,
        ADD COLUMN deleted_by BIGINT UNSIGNED NULL,
        ADD COLUMN closed_at TIMESTAMP NULL,
        ADD COLUMN closed_by BIGINT UNSIGNED NULL,
        ADD COLUMN close_reason_id BIGINT UNSIGNED NULL,
        ADD KEY ix_leads_workflow_status (workflow_status),
        ADD KEY ix_leads_deleted_at (deleted_at),
        ADD KEY ix_leads_original_assigned_at (original_assigned_at)
    `);

    // Backfill original_assigned_at and workflow_status for assigned leads
// Preserve the earliest assignment timestamp available.
await queryRunner.query(`
  UPDATE leads
  SET original_assigned_at = COALESCE(assigned_at, NOW())
  WHERE assigned_agent_id IS NOT NULL
`);

// Existing leads with a quote or an expired eight-hour window
// must start in Processing.
await queryRunner.query(`
  UPDATE leads l
  SET workflow_status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM quotes q
      WHERE q.lead_id = l.id
    ) THEN 'processing'
    WHEN l.original_assigned_at <= DATE_SUB(NOW(), INTERVAL 8 HOUR)
      THEN 'processing'
    ELSE 'new'
  END
  WHERE l.assigned_agent_id IS NOT NULL
`);

    await queryRunner.query(`
      CREATE TABLE lead_close_reasons (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        label VARCHAR(160) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_lead_close_reasons_label (label)
      ) ENGINE=InnoDB
    `);

    // Each contact attempt is retained as a separate history record.
    await queryRunner.query(`
      CREATE TABLE lead_contact_attempts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        lead_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        outcome ENUM('reached', 'unreached') NOT NULL,
        notes TEXT NULL,
        attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_contact_attempts_lead_time (lead_id, attempted_at),
        KEY ix_contact_attempts_user (user_id),
        CONSTRAINT fk_contact_attempts_lead
          FOREIGN KEY (lead_id) REFERENCES leads(id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_contact_attempts_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE leads
        ADD CONSTRAINT fk_leads_close_reason
          FOREIGN KEY (close_reason_id)
          REFERENCES lead_close_reasons(id)
          ON DELETE RESTRICT,
        ADD CONSTRAINT fk_leads_deleted_by
          FOREIGN KEY (deleted_by)
          REFERENCES users(id)
          ON DELETE RESTRICT,
        ADD CONSTRAINT fk_leads_closed_by
          FOREIGN KEY (closed_by)
          REFERENCES users(id)
          ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Do not roll back if application activity has created data that
    // would be lost by removing the new schema.
    const leadRows = (await queryRunner.query(`
      SELECT COUNT(*) AS protected_count
      FROM leads
      WHERE workflow_status IS NOT NULL
         OR travel_type IS NOT NULL
         OR cabin_class = 'first_class'
         OR deleted_at IS NOT NULL
         OR deleted_by IS NOT NULL
         OR closed_at IS NOT NULL
         OR closed_by IS NOT NULL
         OR close_reason_id IS NOT NULL
         OR (
           original_assigned_at IS NOT NULL
           AND (
             assigned_at IS NULL
             OR original_assigned_at <> assigned_at
           )
         )
    `)) as Array<{ protected_count: number | string }>;

    const leadCount = Number(leadRows[0]?.protected_count ?? 0);

    const attemptRows = (await queryRunner.query(`
      SELECT COUNT(*) AS record_count
      FROM lead_contact_attempts
    `)) as Array<{ record_count: number | string }>;

    const attemptCount = Number(attemptRows[0]?.record_count ?? 0);

    const userRows = (await queryRunner.query(`
      SELECT COUNT(*) AS protected_count
      FROM users
      WHERE department IS NOT NULL OR is_manager <> 0
    `)) as Array<{ protected_count: number | string }>;

    const userCount = Number(userRows[0]?.protected_count ?? 0);

    const reasonRows = (await queryRunner.query(`
      SELECT COUNT(*) AS record_count
      FROM lead_close_reasons
    `)) as Array<{ record_count: number | string }>;

    const reasonCount = Number(reasonRows[0]?.record_count ?? 0);

    if (
      leadCount > 0 ||
      attemptCount > 0 ||
      userCount > 0 ||
      reasonCount > 0
    ) {
      throw new Error(
        'Cannot revert lead workflow migration: new workflow data or ' +
          'configuration would be lost. Preserve or migrate that data first.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE leads
        DROP FOREIGN KEY fk_leads_close_reason,
        DROP FOREIGN KEY fk_leads_deleted_by,
        DROP FOREIGN KEY fk_leads_closed_by
    `);

    await queryRunner.query(`DROP TABLE lead_contact_attempts`);
    await queryRunner.query(`DROP TABLE lead_close_reasons`);

    await queryRunner.query(`
      ALTER TABLE leads
        DROP KEY ix_leads_workflow_status,
        DROP KEY ix_leads_deleted_at,
        DROP KEY ix_leads_original_assigned_at,
        DROP COLUMN close_reason_id,
        DROP COLUMN closed_by,
        DROP COLUMN closed_at,
        DROP COLUMN deleted_by,
        DROP COLUMN deleted_at,
        DROP COLUMN original_assigned_at,
        DROP COLUMN workflow_status,
        DROP COLUMN travel_type,
        MODIFY COLUMN cabin_class ENUM(
          'economy',
          'premium_economy',
          'business'
        ) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN is_manager,
        DROP COLUMN department
    `);
  }
}