
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../common/authenticated-request.js';

type DbRow = Record<string, unknown>;

type CreateFlightRequestInput = {
  tripType?: unknown;
  adults?: unknown;
  children?: unknown;
  infants?: unknown;
  cabinClass?: unknown;
  notes?: unknown;
};

const TRIP_TYPES = ['one_way', 'round_trip', 'multi_city'];
const CABIN_CLASSES = [
  'economy',
  'premium_economy',
  'business',
  'first',
];

function parsePassengerCount(value: unknown, field: string, defaultValue: number): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new BadRequestException(`Invalid ${field}.`);
  }

  return parsed;
}

@Injectable()
export class FlightRequestsService {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    user: AuthenticatedUser,
    leadIdValue: string,
    body: CreateFlightRequestInput,
  ) {
    const leadId = String(leadIdValue);

    if (!/^[1-9]\d*$/.test(leadId)) {
      throw new BadRequestException('Invalid lead ID.');
    }

    const tripType = body?.tripType ?? 'round_trip';
    const cabinClass = body?.cabinClass ?? 'economy';

    if (
      typeof tripType !== 'string' ||
      !TRIP_TYPES.includes(tripType)
    ) {
      throw new BadRequestException('Invalid trip type.');
    }

    if (
      typeof cabinClass !== 'string' ||
      !CABIN_CLASSES.includes(cabinClass)
    ) {
      throw new BadRequestException('Invalid cabin class.');
    }

    const adults = parsePassengerCount(body?.adults, 'adults', 1);
    const children = parsePassengerCount(body?.children, 'children', 0);
    const infants = parsePassengerCount(body?.infants, 'infants', 0);

    if (adults + children + infants < 1) {
      throw new BadRequestException(
        'At least one passenger is required.',
      );
    }

    let notes: string | null = null;

    if (body?.notes !== undefined && body.notes !== null) {
      if (typeof body.notes !== 'string' || body.notes.length > 10000) {
        throw new BadRequestException('Invalid flight request notes.');
      }

      notes = body.notes.trim() || null;
    }

    const leads = await this.dataSource.query(
      `SELECT id
       FROM leads
       WHERE id = ?
         AND deleted_at IS NULL
         AND (? = 'admin' OR assigned_agent_id = ?)
       LIMIT 1`,
      [leadId, user.role, user.id],
    ) as DbRow[];

    if (!leads.length) {
      throw new NotFoundException('Lead not found.');
    }

    const result = await this.dataSource.query(
      `INSERT INTO flight_requests (
        lead_id,
        created_by,
        trip_type,
        adults,
        children,
        infants,
        cabin_class,
        status,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?)`,
      [
        leadId,
        user.id,
        tripType,
        adults,
        children,
        infants,
        cabinClass,
        notes,
      ],
    ) as { insertId: number | string };

    await this.dataSource.query(
      `UPDATE leads
       SET last_activity_at = NOW()
       WHERE id = ?`,
      [leadId],
    );

    return this.findOne(user, String(result.insertId));
  }

  async listByLead(user: AuthenticatedUser, leadIdValue: string) {
    const leadId = String(leadIdValue);

    if (!/^[1-9]\d*$/.test(leadId)) {
      throw new BadRequestException('Invalid lead ID.');
    }

    await this.assertLeadAccess(user, leadId);

    const rows = await this.dataSource.query(
      `SELECT
        id,
        lead_id AS leadId,
        created_by AS createdBy,
        trip_type AS tripType,
        adults,
        children,
        infants,
        cabin_class AS cabinClass,
        status,
        notes,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM flight_requests
       WHERE lead_id = ?
       ORDER BY created_at DESC, id DESC`,
      [leadId],
    ) as DbRow[];

    return { data: rows };
  }

  async findOne(user: AuthenticatedUser, idValue: string) {
    const id = String(idValue);

    if (!/^[1-9]\d*$/.test(id)) {
      throw new BadRequestException('Invalid flight request ID.');
    }

    const rows = await this.dataSource.query(
      `SELECT
        fr.id,
        fr.lead_id AS leadId,
        fr.created_by AS createdBy,
        fr.trip_type AS tripType,
        fr.adults,
        fr.children,
        fr.infants,
        fr.cabin_class AS cabinClass,
        fr.status,
        fr.notes,
        fr.created_at AS createdAt,
        fr.updated_at AS updatedAt
       FROM flight_requests fr
       JOIN leads l ON l.id = fr.lead_id
       WHERE fr.id = ?
         AND l.deleted_at IS NULL
         AND (? = 'admin' OR l.assigned_agent_id = ?)
       LIMIT 1`,
      [id, user.role, user.id],
    ) as DbRow[];

    if (!rows.length) {
      throw new NotFoundException('Flight request not found.');
    }

    return { data: rows[0] };
  }

  private async assertLeadAccess(
    user: AuthenticatedUser,
    leadId: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT id
       FROM leads
       WHERE id = ?
         AND deleted_at IS NULL
         AND (? = 'admin' OR assigned_agent_id = ?)
       LIMIT 1`,
      [leadId, user.role, user.id],
    ) as DbRow[];

    if (!rows.length) {
      throw new NotFoundException('Lead not found.');
    }
  }
}
