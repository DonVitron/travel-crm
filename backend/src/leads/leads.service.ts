import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../common/authenticated-request.js';
import { ClientsService } from '../clients/clients.service.js';
import { buildPage, type PageParams } from '../common/pagination.js';
import { parseLeadFields, type LeadFieldsBody } from './lead-fields.js';

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'quoted',
  'won',
  'lost',
] as const;

type LeadRow = Record<string, unknown>;

/** Ids may arrive as JSON strings or numbers; anything else never matches. */
function idToString(value: unknown): string {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
    ? String(value)
    : '';
}

const LEAD_COLUMNS = `
  id,
  customer_name AS customerName,
  customer_email AS customerEmail,
  customer_phone AS customerPhone,
  status,
  notes,
  created_at AS createdAt,
  assigned_agent_id AS assignedAgentId,
  assigned_at AS assignedAt,
  client_id AS clientId`;

/**
 * What agents may see about a lead BEFORE claiming it. Contact details
 * (email, phone) are deliberately left out so leads can't be poached.
 */
const POOL_COLUMNS = `
  id,
  customer_name AS customerName,
  source,
  status,
  notes,
  created_at AS createdAt`;

@Injectable()
export class LeadsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clientsService: ClientsService,
  ) {}

  async count(user: AuthenticatedUser) {
    const isAdmin = user.role === 'admin';

    const rows = (await this.dataSource.query(
      isAdmin
        ? `SELECT COUNT(*) AS total FROM leads`
        : `SELECT COUNT(*) AS total FROM leads WHERE assigned_agent_id = ?`,
      isAdmin ? [] : [user.id],
    )) as Array<{ total: number | string }>;

    return { total: Number(rows[0]?.total ?? 0) };
  }

  async list(user: AuthenticatedUser, paging: PageParams) {
    const isAdmin = user.role === 'admin';

    const countRows = (await this.dataSource.query(
      isAdmin
        ? `SELECT COUNT(*) AS total FROM leads`
        : `SELECT COUNT(*) AS total FROM leads WHERE assigned_agent_id = ?`,
      isAdmin ? [] : [user.id],
    )) as Array<{ total: number | string }>;

    const total = Number(countRows[0]?.total ?? 0);

    const leads = (await this.dataSource.query(
      isAdmin
        ? `SELECT ${LEAD_COLUMNS}
           FROM leads
           ORDER BY created_at DESC, id DESC
           LIMIT ? OFFSET ?`
        : `SELECT ${LEAD_COLUMNS}
           FROM leads
           WHERE assigned_agent_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ? OFFSET ?`,
      isAdmin
        ? [paging.pageSize, paging.offset]
        : [user.id, paging.pageSize, paging.offset],
    )) as LeadRow[];

    return buildPage(leads, total, paging);
  }

  /** Unclaimed leads, oldest first, without contact details. */
  async listPool(paging: PageParams) {
    const countRows = (await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM leads WHERE assigned_agent_id IS NULL`,
    )) as Array<{ total: number | string }>;

    const total = Number(countRows[0]?.total ?? 0);

    const leads = (await this.dataSource.query(
      `SELECT ${POOL_COLUMNS}
       FROM leads
       WHERE assigned_agent_id IS NULL
       ORDER BY created_at ASC, id ASC
       LIMIT ? OFFSET ?`,
      [paging.pageSize, paging.offset],
    )) as LeadRow[];

    return buildPage(leads, total, paging);
  }

  /**
   * Claimed leads (not won/lost) with no activity for `hours`. Admin report;
   * nothing is released automatically.
   */
  async listStale(hours: number, paging: PageParams) {
    const filter = `
      l.assigned_agent_id IS NOT NULL
      AND l.status NOT IN ('won', 'lost')
      AND l.last_activity_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`;

    const countRows = (await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM leads l WHERE ${filter}`,
      [hours],
    )) as Array<{ total: number | string }>;

    const total = Number(countRows[0]?.total ?? 0);

    const leads = (await this.dataSource.query(
      `SELECT
         l.id,
         l.customer_name AS customerName,
         l.status,
         l.assigned_agent_id AS assignedAgentId,
         u.full_name AS assignedAgentName,
         l.assigned_at AS assignedAt,
         l.last_activity_at AS lastActivityAt
       FROM leads l
       JOIN users u ON u.id = l.assigned_agent_id
       WHERE ${filter}
       ORDER BY l.last_activity_at ASC, l.id ASC
       LIMIT ? OFFSET ?`,
      [hours, paging.pageSize, paging.offset],
    )) as LeadRow[];

    return buildPage(leads, total, paging);
  }

  async create(user: AuthenticatedUser, body: LeadFieldsBody) {
    const fields = parseLeadFields(body);
    const assignedAgentId = await this.resolveAssignedAgent(user, body);

    const insertId = await this.clientsService.runInClientTransaction(
      {
        fullName: fields.customerName,
        email: fields.customerEmail,
        phone: fields.customerPhone,
      },
      async (manager, clientId) => {
        const result = (await manager.query(
          `INSERT INTO leads (
            assigned_agent_id,
            assigned_at,
            client_id,
            customer_name,
            customer_email,
            customer_phone,
            status,
            notes
          ) VALUES (?, ${assignedAgentId ? 'NOW()' : 'NULL'}, ?, ?, ?, ?, 'new', ?)`,
          [
            assignedAgentId,
            clientId,
            fields.customerName,
            fields.customerEmail,
            fields.customerPhone,
            fields.notes,
          ],
        )) as { insertId: number | string };

        return result.insertId;
      },
    );

    return { data: await this.findById(insertId) };
  }

  /**
   * Claims a pool lead for the caller. The UPDATE only succeeds while the lead
   * is still unassigned, so when several agents click at once the database
   * picks exactly one winner and the rest get 409.
   */
  async claim(user: AuthenticatedUser, id: string) {
    const result = (await this.dataSource.query(
      `UPDATE leads
       SET assigned_agent_id = ?,
           assigned_at = NOW(),
           last_activity_at = NOW()
       WHERE id = ? AND assigned_agent_id IS NULL`,
      [user.id, id],
    )) as { affectedRows?: number };

    if (!result?.affectedRows) {
      await this.assertExists(id);
      throw new ConflictException('This lead has already been claimed.');
    }

    return { data: await this.findById(id) };
  }

  /** Admin: send a claimed lead back to the pool. */
  async release(id: string) {
    const result = (await this.dataSource.query(
      `UPDATE leads
       SET assigned_agent_id = NULL,
           assigned_at = NULL,
           last_activity_at = NOW()
       WHERE id = ? AND assigned_agent_id IS NOT NULL`,
      [id],
    )) as { affectedRows?: number };

    if (!result?.affectedRows) {
      await this.assertExists(id);
      throw new ConflictException('This lead is already in the pool.');
    }

    return { data: await this.findById(id) };
  }

  /** Admin: give a lead (claimed or in the pool) to a specific active agent. */
  async reassign(id: string, agentId: unknown) {
    const requestedId = idToString(agentId);

    if (!/^[1-9]\d*$/.test(requestedId)) {
      throw new BadRequestException('Invalid agent ID.');
    }

    await this.assertExists(id);
    const assignedAgentId = await this.requireActiveAgent(requestedId);

    await this.dataSource.query(
      `UPDATE leads
       SET assigned_agent_id = ?,
           assigned_at = NOW(),
           last_activity_at = NOW()
       WHERE id = ?`,
      [assignedAgentId, id],
    );

    return { data: await this.findById(id) };
  }

  async updateStatus(user: AuthenticatedUser, id: string, status: unknown) {
    if (
      typeof status !== 'string' ||
      !(LEAD_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException('Invalid lead status.');
    }

    await this.assertCanAccess(user, id);

    await this.dataSource.query(
      `UPDATE leads SET status = ?, last_activity_at = NOW() WHERE id = ?`,
      [status, id],
    );

    return { data: await this.findById(id) };
  }

  async updateDetails(
    user: AuthenticatedUser,
    id: string,
    body: LeadFieldsBody,
  ) {
    const fields = parseLeadFields(body);

    await this.assertCanAccess(user, id);

    await this.dataSource.query(
      `UPDATE leads
       SET customer_name = ?,
           customer_email = ?,
           customer_phone = ?,
           notes = ?,
           last_activity_at = NOW()
       WHERE id = ?`,
      [
        fields.customerName,
        fields.customerEmail,
        fields.customerPhone,
        fields.notes,
        id,
      ],
    );

    return { data: await this.findById(id) };
  }

  /**
   * Admins: omit `assignedAgentId` (or send null) to put the lead in the pool,
   * or pass an active agent's id. Agents: always themselves.
   */
  private async resolveAssignedAgent(
    user: AuthenticatedUser,
    body: LeadFieldsBody,
  ): Promise<string | null> {
    const requested = body?.assignedAgentId;

    if (user.role === 'admin') {
      if (requested === undefined || requested === null) {
        return null;
      }

      const requestedId = idToString(requested);

      if (!/^[1-9]\d*$/.test(requestedId)) {
        throw new BadRequestException('Invalid assigned agent ID.');
      }

      return this.requireActiveAgent(requestedId);
    }

    if (requested !== undefined && idToString(requested) !== user.id) {
      throw new ForbiddenException(
        'Agents can only assign leads to themselves.',
      );
    }

    return user.id;
  }

  private async requireActiveAgent(id: string): Promise<string> {
    const agents = (await this.dataSource.query(
      `SELECT id
       FROM users
       WHERE id = ? AND role = 'agent' AND status = 'active'
       LIMIT 1`,
      [id],
    )) as Array<{ id: string | number | bigint }>;

    if (!agents.length) {
      throw new BadRequestException(
        'The assigned agent does not exist or is not active.',
      );
    }

    return String(agents[0].id);
  }

  private async assertExists(id: string) {
    const rows = (await this.dataSource.query(
      `SELECT id FROM leads WHERE id = ? LIMIT 1`,
      [id],
    )) as unknown[];

    if (!rows.length) {
      throw new NotFoundException('Lead not found.');
    }
  }

  /** 404 if the lead does not exist or is not visible to this user. */
  private async assertCanAccess(user: AuthenticatedUser, id: string) {
    const isAdmin = user.role === 'admin';

    const rows = (await this.dataSource.query(
      isAdmin
        ? `SELECT id FROM leads WHERE id = ? LIMIT 1`
        : `SELECT id FROM leads WHERE id = ? AND assigned_agent_id = ? LIMIT 1`,
      isAdmin ? [id] : [id, user.id],
    )) as Array<{ id: string | number | bigint }>;

    if (!rows.length) {
      throw new NotFoundException('Lead not found.');
    }
  }

  private async findById(id: string | number): Promise<LeadRow | undefined> {
    const rows = (await this.dataSource.query(
      `SELECT ${LEAD_COLUMNS}
       FROM leads
       WHERE id = ?
       LIMIT 1`,
      [id],
    )) as LeadRow[];

    return rows[0];
  }
}
