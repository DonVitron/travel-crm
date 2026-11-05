import 'dotenv/config';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { normalizeEmail, normalizePhone } from '../common/contact.js';

/**
 * Links leads that have no client yet. Safe to re-run (it only touches leads
 * with client_id IS NULL). Uses the same matching rules as the app:
 *   - lead has an email: reuse the client with that email
 *   - no email but a phone: reuse the client with that normalized phone
 *   - neither: create a new client
 * so repeat customers share one client instead of getting one per lead.
 *
 * Run it after the migrations, e.g.:  node dist/database/backfill-clients.js
 * Existing duplicate clients are NOT merged by this script.
 */

interface LeadRow extends RowDataPacket {
  id: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
}

interface IdRow extends RowDataPacket {
  id: number;
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    await connection.beginTransaction();

    const [leads] = await connection.query<LeadRow[]>(
      `SELECT id, customer_name, customer_email, customer_phone
       FROM leads
       WHERE client_id IS NULL
       ORDER BY id
       FOR UPDATE`,
    );

    let created = 0;
    let reused = 0;

    for (const lead of leads) {
      const email = normalizeEmail(lead.customer_email);
      const phoneNormalized = normalizePhone(lead.customer_phone);

      let clientId: number | undefined;

      if (email) {
        const [rows] = await connection.execute<IdRow[]>(
          `SELECT id FROM clients WHERE email = ? ORDER BY id LIMIT 1`,
          [email],
        );
        clientId = rows[0]?.id;
      } else if (phoneNormalized) {
        const [rows] = await connection.execute<IdRow[]>(
          `SELECT id FROM clients WHERE phone_normalized = ? ORDER BY id LIMIT 1`,
          [phoneNormalized],
        );
        clientId = rows[0]?.id;
      }

      if (clientId === undefined) {
        const [result] = await connection.execute<mysql.ResultSetHeader>(
          `INSERT INTO clients (full_name, email, phone, phone_normalized)
           VALUES (?, ?, ?, ?)`,
          [lead.customer_name, email, lead.customer_phone, phoneNormalized],
        );
        clientId = result.insertId;
        created++;
      } else {
        reused++;
      }

      await connection.execute(
        `UPDATE leads SET client_id = ? WHERE id = ? AND client_id IS NULL`,
        [clientId, lead.id],
      );
    }

    await connection.commit();
    console.log(
      `Leads linked: ${leads.length} (new clients: ${created}, existing reused: ${reused})`,
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Client backfill failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
