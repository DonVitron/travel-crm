
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../common/authenticated-request.js';

type SegmentInput = {
  segmentNumber?: unknown;
  airlineName?: unknown;
  flightNumber?: unknown;
  originCode?: unknown;
  destinationCode?: unknown;
  departureAt?: unknown;
  arrivalAt?: unknown;
};

type FlightOptionInput = {
  airlineName?: unknown;
  flightNumbers?: unknown;
  itinerarySummary?: unknown;
  departureAt?: unknown;
  arrivalAt?: unknown;
  baggageDetails?: unknown;
  fareConditions?: unknown;
  currency?: unknown;
  netAmount?: unknown;
  sellingPrice?: unknown;
  segments?: unknown;
};

type DbRow = Record<string, unknown>;

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maxLength
  ) {
    throw new BadRequestException(`Invalid ${field}.`);
  }

  return value.trim();
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || value.length > maxLength) {
    throw new BadRequestException(`Invalid ${field}.`);
  }

  return value.trim() || null;
}

function requiredDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`Invalid ${field}.`);
  }

  return value.trim().replace('T', ' ').replace(/Z$/, '');
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return requiredDate(value, field);
}

function money(value: unknown, field: string): string {
  const amount =
    typeof value === 'number' || typeof value === 'string'
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(amount) || amount < 0 || amount > 99999999999.99) {
    throw new BadRequestException(`Invalid ${field}.`);
  }

  return amount.toFixed(2);
}

function airportCode(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw new BadRequestException(`Invalid ${field}.`);
  }

  return value.trim().toUpperCase();
}

function parseSegments(value: unknown): Array<{
  segmentNumber: number;
  airlineName: string;
  flightNumber: string | null;
  originCode: string;
  destinationCode: string;
  departureAt: string;
  arrivalAt: string | null;
}> {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > 20) {
    throw new BadRequestException('Invalid flight segments.');
  }

  return value.map((item: SegmentInput, index) => {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException('Invalid flight segment.');
    }

    const segmentNumber = item.segmentNumber ?? index + 1;

    if (
      !Number.isInteger(segmentNumber) ||
      Number(segmentNumber) !== index + 1
    ) {
      throw new BadRequestException(
        'Segment numbers must be consecutive, starting at 1.',
      );
    }

    const originCode = airportCode(item.originCode, 'origin code');
    const destinationCode = airportCode(
      item.destinationCode,
      'destination code',
    );

    if (originCode === destinationCode) {
      throw new BadRequestException(
        'Segment origin and destination must differ.',
      );
    }

    return {
      segmentNumber: Number(segmentNumber),
      airlineName: requiredText(item.airlineName, 'segment airline', 160),
      flightNumber: optionalText(item.flightNumber, 'flight number', 40),
      originCode,
      destinationCode,
      departureAt: requiredDate(item.departureAt, 'segment departure'),
      arrivalAt: optionalDate(item.arrivalAt, 'segment arrival'),
    };
  });
}

@Injectable()
export class FlightOptionsService {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    user: AuthenticatedUser,
    flightRequestId: string,
    body: FlightOptionInput,
  ) {
    const request = await this.getAuthorizedRequest(user, flightRequestId);

    if (request.status === 'cancelled') {
      throw new BadRequestException(
        'Cannot add options to a cancelled flight request.',
      );
    }

    const airlineName = requiredText(body?.airlineName, 'airline name', 160);
    const itinerarySummary = requiredText(
      body?.itinerarySummary,
      'itinerary summary',
      10000,
    );
    const currency = requiredText(body?.currency, 'currency', 3).toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('Currency must be a 3-letter code.');
    }

    const netAmount = money(body?.netAmount, 'NET fare');
    const sellingPrice = money(body?.sellingPrice, 'selling price');

    const segments = parseSegments(body?.segments);

    const flightNumbers = optionalText(
      body?.flightNumbers,
      'flight numbers',
      160,
    );
    const departureAt = optionalDate(body?.departureAt, 'departure date');
    const arrivalAt = optionalDate(body?.arrivalAt, 'arrival date');
    const baggageDetails = optionalText(
      body?.baggageDetails,
      'baggage details',
      500,
    );
    const fareConditions = optionalText(
      body?.fareConditions,
      'fare conditions',
      10000,
    );

    if (departureAt && arrivalAt && Date.parse(arrivalAt) < Date.parse(departureAt)) {
      throw new BadRequestException(
        'Arrival date cannot be earlier than departure date.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = (await queryRunner.query(
        `INSERT INTO flight_options (
          flight_request_id,
          entered_by,
          airline_name,
          flight_numbers,
          itinerary_summary,
          departure_at,
          arrival_at,
          baggage_details,
          fare_conditions,
          currency,
          net_amount,
          selling_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          flightRequestId,
          user.id,
          airlineName,
          flightNumbers,
          itinerarySummary,
          departureAt,
          arrivalAt,
          baggageDetails,
          fareConditions,
          currency,
          netAmount,
          sellingPrice,
        ],
      )) as { insertId: number | string };

      const optionId = String(result.insertId);

      for (const segment of segments) {
        await queryRunner.query(
          `INSERT INTO flight_option_segments (
            flight_option_id,
            segment_number,
            airline_name,
            flight_number,
            origin_code,
            destination_code,
            departure_at,
            arrival_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            optionId,
            segment.segmentNumber,
            segment.airlineName,
            segment.flightNumber,
            segment.originCode,
            segment.destinationCode,
            segment.departureAt,
            segment.arrivalAt,
          ],
        );
      }

      await queryRunner.commitTransaction();

      return { data: await this.findOption(user, optionId) };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async list(user: AuthenticatedUser, flightRequestId: string) {
    await this.getAuthorizedRequest(user, flightRequestId);

    const options = (await this.dataSource.query(
      `SELECT
        id,
        flight_request_id AS flightRequestId,
        entered_by AS enteredBy,
        airline_name AS airlineName,
        flight_numbers AS flightNumbers,
        itinerary_summary AS itinerarySummary,
        departure_at AS departureAt,
        arrival_at AS arrivalAt,
        baggage_details AS baggageDetails,
        fare_conditions AS fareConditions,
        currency,
        net_amount AS netAmount,
        selling_price AS sellingPrice,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM flight_options
      WHERE flight_request_id = ?
      ORDER BY created_at DESC, id DESC`,
      [flightRequestId],
    )) as DbRow[];

    return { data: options };
  }

  async findOption(
  user: AuthenticatedUser,
  id: string,
): Promise<{ data: DbRow & { segments: DbRow[] } }> {
    const options = (await this.dataSource.query(
      `SELECT
        fo.id,
        fo.flight_request_id AS flightRequestId,
        fo.entered_by AS enteredBy,
        fo.airline_name AS airlineName,
        fo.flight_numbers AS flightNumbers,
        fo.itinerary_summary AS itinerarySummary,
        fo.departure_at AS departureAt,
        fo.arrival_at AS arrivalAt,
        fo.baggage_details AS baggageDetails,
        fo.fare_conditions AS fareConditions,
        fo.currency,
        fo.net_amount AS netAmount,
        fo.selling_price AS sellingPrice,
        fo.status,
        fo.created_at AS createdAt,
        fo.updated_at AS updatedAt
      FROM flight_options fo
      JOIN flight_requests fr ON fr.id = fo.flight_request_id
      JOIN leads l ON l.id = fr.lead_id
      WHERE fo.id = ?
        AND l.deleted_at IS NULL
        AND (
          ? = 'admin'
          OR l.assigned_agent_id = ?
        )
      LIMIT 1`,
      [id, user.role, user.id],
    )) as DbRow[];

    if (!options.length) {
      throw new NotFoundException('Flight option not found.');
    }

    const segments = (await this.dataSource.query(
      `SELECT
        id,
        segment_number AS segmentNumber,
        airline_name AS airlineName,
        flight_number AS flightNumber,
        origin_code AS originCode,
        destination_code AS destinationCode,
        departure_at AS departureAt,
        arrival_at AS arrivalAt
      FROM flight_option_segments
      WHERE flight_option_id = ?
      ORDER BY segment_number ASC`,
      [id],
    )) as DbRow[];

    return {
      data: {
        ...options[0],
        segments,
      },
    };
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    body: FlightOptionInput,
  ) {
    const current = await this.findOption(user, id);
    const requestId = String(current.data.flightRequestId);

    const request = await this.getAuthorizedRequest(user, requestId);

    if (request.status === 'cancelled') {
      throw new BadRequestException(
        'Cannot edit options for a cancelled flight request.',
      );
    }

    const airlineName = requiredText(body?.airlineName, 'airline name', 160);
    const itinerarySummary = requiredText(
      body?.itinerarySummary,
      'itinerary summary',
      10000,
    );
    const currency = requiredText(body?.currency, 'currency', 3).toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('Currency must be a 3-letter code.');
    }

    const segments = parseSegments(body?.segments);

    const departureAt = optionalDate(body?.departureAt, 'departure date');
    const arrivalAt = optionalDate(body?.arrivalAt, 'arrival date');

    if (departureAt && arrivalAt && Date.parse(arrivalAt) < Date.parse(departureAt)) {
      throw new BadRequestException(
        'Arrival date cannot be earlier than departure date.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `UPDATE flight_options
        SET airline_name = ?,
            flight_numbers = ?,
            itinerary_summary = ?,
            departure_at = ?,
            arrival_at = ?,
            baggage_details = ?,
            fare_conditions = ?,
            currency = ?,
            net_amount = ?,
            selling_price = ?
        WHERE id = ?`,
        [
          airlineName,
          optionalText(body?.flightNumbers, 'flight numbers', 160),
          itinerarySummary,
          departureAt,
          arrivalAt,
          optionalText(body?.baggageDetails, 'baggage details', 500),
          optionalText(body?.fareConditions, 'fare conditions', 10000),
          currency,
          money(body?.netAmount, 'NET fare'),
          money(body?.sellingPrice, 'selling price'),
          id,
        ],
      );

      if (body?.segments !== undefined) {
        await queryRunner.query(
          `DELETE FROM flight_option_segments WHERE flight_option_id = ?`,
          [id],
        );

        for (const segment of segments) {
          await queryRunner.query(
            `INSERT INTO flight_option_segments (
              flight_option_id,
              segment_number,
              airline_name,
              flight_number,
              origin_code,
              destination_code,
              departure_at,
              arrival_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              segment.segmentNumber,
              segment.airlineName,
              segment.flightNumber,
              segment.originCode,
              segment.destinationCode,
              segment.departureAt,
              segment.arrivalAt,
            ],
          );
        }
      }

      await queryRunner.commitTransaction();

      return await this.findOption(user, id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async getAuthorizedRequest(
    user: AuthenticatedUser,
    flightRequestId: string,
  ) {
    const rows = (await this.dataSource.query(
      `SELECT
        fr.id,
        fr.lead_id AS leadId,
        fr.status
      FROM flight_requests fr
      JOIN leads l ON l.id = fr.lead_id
      WHERE fr.id = ?
        AND l.deleted_at IS NULL
        AND (
          ? = 'admin'
          OR l.assigned_agent_id = ?
        )
      LIMIT 1`,
      [flightRequestId, user.role, user.id],
    )) as Array<{
      id: string | number;
      leadId: string | number;
      status: string;
    }>;

    if (!rows.length) {
      throw new NotFoundException('Flight request not found.');
    }

    return rows[0];
  }
}
