
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { RowDataPacket } from 'mysql2';

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

interface LeadRow extends RowDataPacket {
  id: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  client_id: number | null;
}

const [leads] = await connection.query<LeadRow[]>(
      `SELECT id, customer_name, customer_email, customer_phone, client_id
       FROM leads
       WHERE client_id IS NULL
       ORDER BY id
       FOR UPDATE`,
    );

    let created = 0;

    for (const lead of leads) {
      const [result] = await connection.execute<mysql.ResultSetHeader>(
        `INSERT INTO clients (full_name, email, phone)
         VALUES (?, ?, ?)`,
        [
          lead.customer_name,
          lead.customer_email,
          lead.customer_phone,
        ],
      );

      await connection.execute(
        `UPDATE leads SET client_id = ? WHERE id = ? AND client_id IS NULL`,
        [result.insertId, lead.id],
      );

      created++;
    }

    await connection.commit();
    console.log(`Clients created and linked: ${created}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Client backfill failed:', error.message);
  process.exitCode = 1;
});
