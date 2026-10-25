import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../common/authenticated-request.js';
import { buildPage, type PageParams } from '../common/pagination.js';

const MAX_SEARCH_LENGTH = 200;

type ClientRow = {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
};

@Injectable()
export class ClientsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Trims the search text and rejects values that are too long. */
  normalizeSearch(searchParam?: string): string {
    const search = typeof searchParam === 'string' ? searchParam.trim() : '';

    if (search.length > MAX_SEARCH_LENGTH) {
      throw new BadRequestException(
        `Search must be at most ${MAX_SEARCH_LENGTH} characters.`,
      );
    }

    return search;
  }

  async list(user: AuthenticatedUser, paging: PageParams, search: string) {
    const isAdmin = user.role === 'admin';

    // Agents only see clients that have at least one lead assigned to them.
    const scopeSql = isAdmin
      ? ''
      : `AND EXISTS (
          SELECT 1
          FROM leads permitted_lead
          WHERE permitted_lead.client_id = c.id
            AND permitted_lead.assigned_agent_id = ?
        )`;

    const searchSql = search
      ? `AND (
          c.full_name LIKE ?
          OR c.email LIKE ?
          OR c.phone LIKE ?
        )`
      : '';

    const filterParams: Array<string | number> = [];

    if (!isAdmin) {
      filterParams.push(user.id);
    }

    if (search) {
      const pattern = `%${search}%`;
      filterParams.push(pattern, pattern, pattern);
    }

    const countRows = (await this.dataSource.query(
      `SELECT COUNT(*) AS total
       FROM clients c
       WHERE 1 = 1
       ${scopeSql}
       ${searchSql}`,
      filterParams,
    )) as Array<{ total: number | string }>;

    const total = Number(countRows[0]?.total ?? 0);

    const clients = (await this.dataSource.query(
      `SELECT
         c.id,
         c.full_name AS fullName,
         c.email,
         c.phone,
         c.created_at AS createdAt,
         COUNT(DISTINCT l.id) AS leadCount
       FROM clients c
       LEFT JOIN leads l
         ON l.client_id = c.id
         ${isAdmin ? '' : 'AND l.assigned_agent_id = ?'}
       WHERE 1 = 1
       ${scopeSql}
       ${searchSql}
       GROUP BY
         c.id,
         c.full_name,
         c.email,
         c.phone,
         c.created_at
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [
        ...(isAdmin ? [] : [user.id]), // the JOIN's agent filter comes first
        ...filterParams,
        paging.pageSize,
        paging.offset,
      ],
    )) as unknown[];

    return buildPage(clients, total, paging);
  }

  async getById(user: AuthenticatedUser, id: number) {
    const isAdmin = user.role === 'admin';

    const clientRows = (await this.dataSource.query(
      `SELECT
         c.id,
         c.full_name AS fullName,
         c.email,
         c.phone,
         c.created_at AS createdAt
       FROM clients c
       WHERE c.id = ?
       ${
         isAdmin
           ? ''
           : `AND EXISTS (
               SELECT 1
               FROM leads permitted_lead
               WHERE permitted_lead.client_id = c.id
                 AND permitted_lead.assigned_agent_id = ?
             )`
       }
       LIMIT 1`,
      isAdmin ? [id] : [id, user.id],
    )) as ClientRow[];

    const client = clientRows[0];

    if (!client) {
      throw new NotFoundException('Client not found.');
    }

    const leads = (await this.dataSource.query(
      `SELECT
         l.id,
         l.origin_code AS originCode,
         l.destination_code AS destinationCode,
         l.cabin_class AS cabinClass,
         l.departure_date AS departureDate,
         l.return_date AS returnDate,
         l.status,
         l.source,
         l.contactability,
         l.created_at AS createdAt,
         l.assigned_at AS assignedAt,
         l.assigned_agent_id AS assignedAgentId
       FROM leads l
       WHERE l.client_id = ?
       ${isAdmin ? '' : 'AND l.assigned_agent_id = ?'}
       ORDER BY l.created_at DESC, l.id DESC`,
      isAdmin ? [id] : [id, user.id],
    )) as unknown[];

    return {
      data: {
        ...client,
        leads,
        leadCount: leads.length,
      },
    };
  }
}
