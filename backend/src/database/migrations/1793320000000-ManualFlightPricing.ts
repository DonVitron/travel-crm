
import {
  MigrationInterface,
  QueryRunner,
} from 'typeorm';

export class ManualFlightPricing1793320000000
  implements MigrationInterface
{
  name = 'ManualFlightPricing1793320000000';

  private async assertTablesEmpty(
    queryRunner: QueryRunner,
    tables: string[],
  ): Promise<void> {
    for (const table of tables) {
      const rows = (await queryRunner.query(
        `SELECT COUNT(*) AS total FROM \`${table}\``,
      )) as Array<{ total: string | number }>;

      if (Number(rows[0]?.total ?? 0) > 0) {
        throw new Error(
          `Cannot migrate manual pricing: ${table} contains data. ` +
          'No changes have been made. Review and migrate existing records first.',
        );
      }
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Prevent accidental loss of existing pricing records.
    await this.assertTablesEmpty(queryRunner, [
      'flight_options',
      'quote_items',
      'supplier_fares',
    ]);

    // Agents enter both amounts manually.
    await queryRunner.query(`
      ALTER TABLE flight_options
        ADD COLUMN net_amount DECIMAL(13,2) NOT NULL,
        ADD COLUMN selling_price DECIMAL(13,2) NOT NULL
    `);

    // Remove the old supplier-fare relationship.
    await queryRunner.query(`
      ALTER TABLE quote_items
        DROP FOREIGN KEY fk_quote_items_fare,
        DROP CHECK chk_quote_markup,
        DROP CHECK chk_quote_price,
        DROP COLUMN supplier_fare_id,
        DROP COLUMN markup_percent,
        DROP COLUMN customer_price
    `);

    // Store NET and Selling price snapshots on each quote item.
    await queryRunner.query(`
      ALTER TABLE quote_items
        ADD COLUMN net_amount DECIMAL(13,2) NOT NULL,
        ADD COLUMN selling_price DECIMAL(13,2) NOT NULL,
        ADD CONSTRAINT chk_quote_item_net
          CHECK (net_amount >= 0),
        ADD CONSTRAINT chk_quote_item_selling
          CHECK (selling_price >= 0)
    `);

    // Supplier lookup is no longer part of the pricing model.
    await queryRunner.query(`
      DROP TABLE supplier_fares
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Do not discard manually entered prices during rollback.
    await this.assertTablesEmpty(queryRunner, [
      'flight_options',
      'quote_items',
    ]);

    await queryRunner.query(`
      CREATE TABLE supplier_fares (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        flight_option_id BIGINT UNSIGNED NOT NULL,
        supplier_name VARCHAR(160) NOT NULL,
        net_amount DECIMAL(13,2) NOT NULL,
        currency CHAR(3) NOT NULL,
        valid_until DATETIME NULL,
        recorded_by BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_supplier_fares_option (flight_option_id),
        KEY fk_supplier_fares_user (recorded_by),
        CONSTRAINT fk_supplier_fares_option
          FOREIGN KEY (flight_option_id)
          REFERENCES flight_options (id) ON DELETE RESTRICT,
        CONSTRAINT fk_supplier_fares_user
          FOREIGN KEY (recorded_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT chk_supplier_fares_amount
          CHECK (net_amount >= 0)
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      ALTER TABLE quote_items
        DROP CHECK chk_quote_item_net,
        DROP CHECK chk_quote_item_selling,
        DROP COLUMN net_amount,
        DROP COLUMN selling_price,
        ADD COLUMN supplier_fare_id BIGINT UNSIGNED NULL,
        ADD COLUMN markup_percent DECIMAL(6,2) NOT NULL DEFAULT 0,
        ADD COLUMN customer_price DECIMAL(13,2) NOT NULL DEFAULT 0,
        ADD KEY fk_quote_items_fare (supplier_fare_id),
        ADD CONSTRAINT fk_quote_items_fare
          FOREIGN KEY (supplier_fare_id)
          REFERENCES supplier_fares (id) ON DELETE RESTRICT,
        ADD CONSTRAINT chk_quote_markup
          CHECK (markup_percent >= 0),
        ADD CONSTRAINT chk_quote_price
          CHECK (customer_price >= 0)
    `);

    await queryRunner.query(`
      ALTER TABLE flight_options
        DROP COLUMN net_amount,
        DROP COLUMN selling_price
    `);
  }
}
