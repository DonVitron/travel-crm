import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialTravelCrmSchema1792627200000
  implements MigrationInterface
{
  name = 'InitialTravelCrmSchema1792627200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        email VARCHAR(254) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(160) NOT NULL,
        role ENUM('admin','agent') NOT NULL DEFAULT 'agent',
        status ENUM('active','suspended') NOT NULL DEFAULT 'active',
        markup_min_percent DECIMAL(6,2) NOT NULL DEFAULT 0,
        markup_max_percent DECIMAL(6,2) NOT NULL DEFAULT 20,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email),
        CONSTRAINT chk_users_markup CHECK (
          markup_min_percent >= 0
          AND markup_max_percent >= markup_min_percent
          AND markup_max_percent <= 1000
        )
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE leads (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        assigned_agent_id BIGINT UNSIGNED NOT NULL,
        customer_name VARCHAR(160) NOT NULL,
        customer_email VARCHAR(254) NULL,
        customer_phone VARCHAR(40) NULL,
        status ENUM('new','contacted','qualified','quoted','won','lost')
          NOT NULL DEFAULT 'new',
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_leads_agent_status (assigned_agent_id, status),
        CONSTRAINT fk_leads_agent FOREIGN KEY (assigned_agent_id)
          REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE flight_requests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        lead_id BIGINT UNSIGNED NOT NULL,
        created_by BIGINT UNSIGNED NOT NULL,
        trip_type ENUM('one_way','round_trip','multi_city')
          NOT NULL DEFAULT 'round_trip',
        adults SMALLINT UNSIGNED NOT NULL DEFAULT 1,
        children SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        infants SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        cabin_class ENUM('economy','premium_economy','business','first')
          NOT NULL DEFAULT 'economy',
        status ENUM('requested','options_ready','cancelled')
          NOT NULL DEFAULT 'requested',
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_flight_requests_lead (lead_id),
        KEY ix_flight_requests_status_created (status, created_at),
        CONSTRAINT fk_flight_requests_lead FOREIGN KEY (lead_id)
          REFERENCES leads(id) ON DELETE RESTRICT,
        CONSTRAINT fk_flight_requests_creator FOREIGN KEY (created_by)
          REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT chk_flight_adults CHECK (adults >= 1)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE flight_segments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        flight_request_id BIGINT UNSIGNED NOT NULL,
        segment_number SMALLINT UNSIGNED NOT NULL,
        origin_code CHAR(3) NOT NULL,
        destination_code CHAR(3) NOT NULL,
        departure_date DATE NOT NULL,
        departure_time TIME NULL,
        arrival_date DATE NULL,
        arrival_time TIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_flight_segments_order
          (flight_request_id, segment_number),
        KEY ix_flight_segments_route
          (origin_code, destination_code, departure_date),
        CONSTRAINT fk_flight_segments_request
          FOREIGN KEY (flight_request_id)
          REFERENCES flight_requests(id) ON DELETE RESTRICT,
        CONSTRAINT chk_flight_segments_order CHECK (segment_number >= 1),
        CONSTRAINT chk_flight_segments_airports
          CHECK (origin_code <> destination_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE flight_options (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        flight_request_id BIGINT UNSIGNED NOT NULL,
        entered_by BIGINT UNSIGNED NOT NULL,
        airline_name VARCHAR(160) NOT NULL,
        flight_numbers VARCHAR(160) NULL,
        itinerary_summary TEXT NOT NULL,
        departure_at DATETIME NULL,
        arrival_at DATETIME NULL,
        baggage_details VARCHAR(500) NULL,
        fare_conditions TEXT NULL,
        currency CHAR(3) NOT NULL,
        status ENUM('available','selected','unavailable')
          NOT NULL DEFAULT 'available',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_flight_options_request_status (flight_request_id, status),
        CONSTRAINT fk_flight_options_request FOREIGN KEY (flight_request_id)
          REFERENCES flight_requests(id) ON DELETE RESTRICT,
        CONSTRAINT fk_flight_options_user FOREIGN KEY (entered_by)
          REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE flight_option_segments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        flight_option_id BIGINT UNSIGNED NOT NULL,
        segment_number SMALLINT UNSIGNED NOT NULL,
        airline_name VARCHAR(160) NOT NULL,
        flight_number VARCHAR(40) NULL,
        origin_code CHAR(3) NOT NULL,
        destination_code CHAR(3) NOT NULL,
        departure_at DATETIME NOT NULL,
        arrival_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_option_segments_order
          (flight_option_id, segment_number),
        KEY ix_option_segments_route
          (origin_code, destination_code, departure_at),
        CONSTRAINT fk_option_segments_option
          FOREIGN KEY (flight_option_id)
          REFERENCES flight_options(id) ON DELETE RESTRICT,
        CONSTRAINT chk_option_segments_order
          CHECK (segment_number >= 1),
        CONSTRAINT chk_option_segments_airports
          CHECK (origin_code <> destination_code),
        CONSTRAINT chk_option_segments_times
          CHECK (arrival_at IS NULL OR arrival_at >= departure_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

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
        CONSTRAINT fk_supplier_fares_option FOREIGN KEY (flight_option_id)
          REFERENCES flight_options(id) ON DELETE RESTRICT,
        CONSTRAINT fk_supplier_fares_user FOREIGN KEY (recorded_by)
          REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT chk_supplier_fares_amount CHECK (net_amount >= 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE quotes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        lead_id BIGINT UNSIGNED NOT NULL,
        agent_id BIGINT UNSIGNED NOT NULL,
        quote_number VARCHAR(40) NOT NULL,
        status ENUM('draft','sent','accepted','rejected','expired')
          NOT NULL DEFAULT 'draft',
        currency CHAR(3) NOT NULL,
        customer_total DECIMAL(13,2) NOT NULL DEFAULT 0,
        expires_at DATETIME NULL,
        sent_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_quotes_number (quote_number),
        KEY ix_quotes_agent_status (agent_id, status),
        KEY ix_quotes_lead (lead_id),
        CONSTRAINT fk_quotes_lead FOREIGN KEY (lead_id)
          REFERENCES leads(id) ON DELETE RESTRICT,
        CONSTRAINT fk_quotes_agent FOREIGN KEY (agent_id)
          REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT chk_quotes_total CHECK (customer_total >= 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE quote_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        quote_id BIGINT UNSIGNED NOT NULL,
        flight_option_id BIGINT UNSIGNED NOT NULL,
        supplier_fare_id BIGINT UNSIGNED NULL,
        description_snapshot TEXT NOT NULL,
        currency CHAR(3) NOT NULL,
        markup_percent DECIMAL(6,2) NOT NULL,
        customer_price DECIMAL(13,2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_quote_items_quote (quote_id),
        CONSTRAINT fk_quote_items_quote FOREIGN KEY (quote_id)
          REFERENCES quotes(id) ON DELETE RESTRICT,
        CONSTRAINT fk_quote_items_option FOREIGN KEY (flight_option_id)
          REFERENCES flight_options(id) ON DELETE RESTRICT,
        CONSTRAINT fk_quote_items_fare FOREIGN KEY (supplier_fare_id)
          REFERENCES supplier_fares(id) ON DELETE RESTRICT,
        CONSTRAINT chk_quote_markup CHECK (markup_percent >= 0),
        CONSTRAINT chk_quote_price CHECK (customer_price >= 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        actor_user_id BIGINT UNSIGNED NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(80) NULL,
        metadata JSON NULL,
        ip_address VARCHAR(45) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_audit_actor_time (actor_user_id, created_at),
        KEY ix_audit_entity (entity_type, entity_id),
        CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id)
          REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS audit_logs');
    await queryRunner.query('DROP TABLE IF EXISTS quote_items');
    await queryRunner.query('DROP TABLE IF EXISTS quotes');
    await queryRunner.query('DROP TABLE IF EXISTS supplier_fares');
    await queryRunner.query('DROP TABLE IF EXISTS flight_option_segments');
    await queryRunner.query('DROP TABLE IF EXISTS flight_options');
    await queryRunner.query('DROP TABLE IF EXISTS flight_segments');
    await queryRunner.query('DROP TABLE IF EXISTS flight_requests');
    await queryRunner.query('DROP TABLE IF EXISTS leads');
    await queryRunner.query('DROP TABLE IF EXISTS users');
  }
}