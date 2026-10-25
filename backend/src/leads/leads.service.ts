import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../common/authenticated-request.js';
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
  created_at AS createdAt`;

@Injectable()
export class LeadsService {
  constructor(private readonly dataSource: DataSource) {}

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

  async create(user: AuthenticatedUser, body: LeadFieldsBody) {
    const fields = parseLeadFields(body);
    const assignedAgentId = await this.resolveAssignedAgent(user, body);

    const insertResult = (await this.dataSource.query(
      `INSERT INTO leads (
        assigned_agent_id,
        customer_name,
        customer_email,
        customer_phone,
        status,
        notes
      ) VALUES (?, ?, ?, ?, 'new', ?)`,
      [
        assignedAgentId,
        fields.customerName,
        fields.customerEmail,
        fields.customerPhone,
        fields.notes,
      ],
    )) as { insertId: number | string };

    return { data: await this.findById(insertResult.insertId) };
  }

  async updateStatus(user: AuthenticatedUser, id: string, status: unknown) {
    if (
      typeof status !== 'string' ||
      !(LEAD_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException('Invalid lead status.');
    }

    await this.assertCanAccess(user, id);

    await this.dataSource.query(`UPDATE leads SET status = ? WHERE id = ?`, [
      status,
      id,
    ]);

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
           notes = ?
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

  /** Admins may assign to any active agent; agents only to themselves. */
  private async resolveAssignedAgent(
    user: AuthenticatedUser,
    body: LeadFieldsBody,
  ): Promise<string> {
    if (user.role === 'admin' && body?.assignedAgentId !== undefined) {
      const requestedId = idToString(body.assignedAgentId);

      if (!/^[1-9]\d*$/.test(requestedId)) {
        throw new BadRequestException('Invalid assigned agent ID.');
      }

      const agents = (await this.dataSource.query(
        `SELECT id
         FROM users
         WHERE id = ? AND role = 'agent' AND status = 'active'
         LIMIT 1`,
        [requestedId],
      )) as Array<{ id: string | number | bigint }>;

      if (!agents.length) {
        throw new BadRequestException(
          'The assigned agent does not exist or is not active.',
        );
      }

      return String(agents[0].id);
    }

    if (
      user.role === 'agent' &&
      body?.assignedAgentId !== undefined &&
      idToString(body.assignedAgentId) !== user.id
    ) {
      throw new ForbiddenException(
        'Agents can only assign leads to themselves.',
      );
    }

    return user.id;
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
