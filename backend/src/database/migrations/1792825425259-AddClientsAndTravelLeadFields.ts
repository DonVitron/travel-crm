import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientsAndTravelLeadFields1792825425259
  implements MigrationInterface
{
  name = 'AddClientsAndTravelLeadFields1792825425259';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE clients (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        full_name VARCHAR(160) NOT NULL,
        email VARCHAR(254) NULL,
        phone VARCHAR(40) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_clients_email (email),
        KEY ix_clients_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      ALTER TABLE leads
        ADD COLUMN client_id BIGINT UNSIGNED NULL,
        ADD COLUMN origin_code CHAR(3) NULL,
        ADD COLUMN destination_code CHAR(3) NULL,
        ADD COLUMN cabin_class
          ENUM('economy','premium_economy','business') NULL,
        ADD COLUMN departure_date DATE NULL,
        ADD COLUMN return_date DATE NULL,
        ADD COLUMN source
          ENUM('INBOX','LIVE_CHAT','OTHER','GENERAL_LINE')
          NOT NULL DEFAULT 'INBOX',
        ADD COLUMN contactability
          ENUM('reached','unreached')
          NOT NULL DEFAULT 'unreached',
        ADD COLUMN assigned_at TIMESTAMP NULL,
        ADD KEY ix_leads_client (client_id)
    `);

    await queryRunner.query(`
      ALTER TABLE leads
        ADD CONSTRAINT fk_leads_client
        FOREIGN KEY (client_id) REFERENCES clients(id)
        ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE leads
        DROP FOREIGN KEY fk_leads_client,
        DROP KEY ix_leads_client,
        DROP COLUMN assigned_at,
        DROP COLUMN contactability,
        DROP COLUMN source,
        DROP COLUMN return_date,
        DROP COLUMN departure_date,
        DROP COLUMN cabin_class,
        DROP COLUMN destination_code,
        DROP COLUMN origin_code,
        DROP COLUMN client_id
    `);

    await queryRunner.query('DROP TABLE clients');
  }
}