
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../common/authenticated-request.js';

type DbRow = Record<string, unknown>;

type CreateQuoteInput = {
  flightOptionId?: unknown;
  expiresAt?: unknown;
};

function parsePositiveId(value: unknown, field: string): string {
  const text = String(value ?? '');

  if (!/^[1-9]\d*$/.test(text)) {
    throw new BadRequestException(`Invalid ${field}.`);
  }

  return text;
}

function parseExpiry(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new BadRequestException('Invalid quote expiry date.');
  }

  return value.trim().replace('T', ' ').replace(/Z$/, '');
}

@Injectable()
export class QuotesService {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    user: AuthenticatedUser,
    leadIdValue: string,
    body: CreateQuoteInput,
  ) {
    const leadId = parsePositiveId(leadIdValue, 'lead ID');
    const flightOptionId = parsePositiveId(
      body?.flightOptionId,
      'flight option ID',
    );
    const expiresAt = parseExpiry(body?.expiresAt);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const leads = (await queryRunner.query(
        `SELECT
          l.id,
          l.workflow_status AS workflowStatus
        FROM leads l
        WHERE l.id = ?
          AND l.deleted_at IS NULL
          AND (
            ? = 'admin'
            OR l.assigned_agent_id = ?
          )
        LIMIT 1
        FOR UPDATE`,
        [leadId, user.role, user.id],
      )) as DbRow[];

      if (!leads.length) {
        throw new NotFoundException('Lead not found.');
      }

      const options = (await queryRunner.query(
        `SELECT
          fo.id,
          fo.flight_request_id AS flightRequestId,
          fo.currency,
          fo.net_amount AS netAmount,
          fo.selling_price AS sellingPrice,
          fo.airline_name AS airlineName,
          fo.flight_numbers AS flightNumbers,
          fo.itinerary_summary AS itinerarySummary,
          fr.lead_id AS leadId
        FROM flight_options fo
        JOIN flight_requests fr ON fr.id = fo.flight_request_id
        WHERE fo.id = ?
          AND fr.lead_id = ?
        LIMIT 1
        FOR UPDATE`,
        [flightOptionId, leadId],
      )) as DbRow[];

      if (!options.length) {
        throw new BadRequestException(
          'The selected flight option does not belong to this lead.',
        );
      }

      const option = options[0];

      const quoteNumber = await this.generateQuoteNumber(queryRunner);

      const quoteResult = (await queryRunner.query(
        `INSERT INTO quotes (
          lead_id,
          agent_id,
          quote_number,
          status,
          currency,
          customer_total,
          expires_at
        ) VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
        [
          leadId,
          user.id,
          quoteNumber,
          option.currency,
          option.sellingPrice,
          expiresAt,
        ],
      )) as { insertId: number | string };

      const quoteId = String(quoteResult.insertId);

      const description = [
        String(option.airlineName),
        option.flightNumbers
          ? `Flight(s): ${String(option.flightNumbers)}`
          : null,
        String(option.itinerarySummary),
      ]
        .filter(Boolean)
        .join(' | ');

      await queryRunner.query(
        `INSERT INTO quote_items (
          quote_id,
          flight_option_id,
          description_snapshot,
          currency,
          net_amount,
          selling_price
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          quoteId,
          flightOptionId,
          description,
          option.currency,
          option.netAmount,
          option.sellingPrice,
        ],
      );

      await queryRunner.query(
        `UPDATE leads
        SET workflow_status = CASE
          WHEN workflow_status = 'new' THEN 'processing'
          ELSE workflow_status
        END,
        last_activity_at = NOW()
        WHERE id = ?`,
        [leadId],
      );

      await queryRunner.commitTransaction();

      return await this.findOne(user, quoteId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async listByLead(user: AuthenticatedUser, leadIdValue: string) {
    const leadId = parsePositiveId(leadIdValue, 'lead ID');

    await this.assertLeadAccess(user, leadId);

    const rows = (await this.dataSource.query(
      `SELECT
        q.id,
        q.lead_id AS leadId,
        q.agent_id AS agentId,
        q.quote_number AS quoteNumber,
        q.status,
        q.currency,
        q.customer_total AS customerTotal,
        q.expires_at AS expiresAt,
        q.sent_at AS sentAt,
        q.created_at AS createdAt,
        qi.flight_option_id AS flightOptionId,
        qi.description_snapshot AS description,
        qi.net_amount AS netAmount,
        qi.selling_price AS sellingPrice
      FROM quotes q
      LEFT JOIN quote_items qi ON qi.quote_id = q.id
      WHERE q.lead_id = ?
      ORDER BY q.created_at DESC, q.id DESC`,
      [leadId],
    )) as DbRow[];

    return { data: rows };
  }

  async findOne(user: AuthenticatedUser, quoteIdValue: string) {
    const quoteId = parsePositiveId(quoteIdValue, 'quote ID');

    const rows = (await this.dataSource.query(
      `SELECT
        q.id,
        q.lead_id AS leadId,
        q.agent_id AS agentId,
        q.quote_number AS quoteNumber,
        q.status,
        q.currency,
        q.customer_total AS customerTotal,
        q.expires_at AS expiresAt,
        q.sent_at AS sentAt,
        q.created_at AS createdAt,
        q.updated_at AS updatedAt,
        qi.flight_option_id AS flightOptionId,
        qi.description_snapshot AS description,
        qi.currency AS itemCurrency,
        qi.net_amount AS netAmount,
        qi.selling_price AS sellingPrice
      FROM quotes q
      LEFT JOIN quote_items qi ON qi.quote_id = q.id
      JOIN leads l ON l.id = q.lead_id
      WHERE q.id = ?
        AND l.deleted_at IS NULL
        AND (
          ? = 'admin'
          OR l.assigned_agent_id = ?
        )
      LIMIT 1`,
      [quoteId, user.role, user.id],
    )) as DbRow[];

    if (!rows.length) {
      throw new NotFoundException('Quote not found.');
    }

    return { data: rows[0] };
  }

  private async assertLeadAccess(
    user: AuthenticatedUser,
    leadId: string,
  ) {
    const rows = (await this.dataSource.query(
      `SELECT id
      FROM leads
      WHERE id = ?
        AND deleted_at IS NULL
        AND (
          ? = 'admin'
          OR assigned_agent_id = ?
        )
      LIMIT 1`,
      [leadId, user.role, user.id],
    )) as DbRow[];

    if (!rows.length) {
      throw new NotFoundException('Lead not found.');
    }
  }

  private async generateQuoteNumber(queryRunner: {
    query: (sql: string, parameters?: unknown[]) => Promise<unknown>;
  }): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `QT-${Date.now()}-${Math.floor(
        Math.random() * 100000,
      )
        .toString()
        .padStart(5, '0')}`;

      const existing = (await queryRunner.query(
        `SELECT id FROM quotes WHERE quote_number = ? LIMIT 1`,
        [candidate],
      )) as DbRow[];

      if (!existing.length) {
        return candidate;
      }
    }

    throw new BadRequestException(
      'Could not generate a unique quote number. Please try again.',
    );
  }
}
