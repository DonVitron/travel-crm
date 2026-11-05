import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';

type UserRow = {
  id: string | number | bigint;
  email: string;
  fullName: string;
  role: 'admin' | 'agent';
  status: 'active' | 'suspended';
  department: string | null;
  isManager: number | boolean;
  createdAt: Date | string;
};

@Injectable()
export class UsersService {
  constructor(
  private readonly dataSource: DataSource,
  private readonly config: ConfigService,
) {}  

  private normalizeEmail(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('A valid email is required.');
    }

    const email = value.trim().toLowerCase();

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new BadRequestException('A valid email is required.');
    }

    return email;
  }

  private normalizeFullName(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('Full name is required.');
    }

    const fullName = value.trim();

    if (!fullName || fullName.length > 160) {
      throw new BadRequestException(
        'Full name must contain between 1 and 160 characters.',
      );
    }

    return fullName;
  }

  private normalizePassword(value: unknown): string {
    if (
      typeof value !== 'string' ||
      value.length < 12 ||
      value.length > 128
    ) {
      throw new BadRequestException(
        'Password must contain between 12 and 128 characters.',
      );
    }

    return value;
  }

  private normalizeDepartment(value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    if (typeof value !== 'string' || value.trim().length > 80) {
      throw new BadRequestException('Invalid department.');
    }

    return value.trim().toLowerCase();
  }

  private normalizeManager(value: unknown): boolean {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(
        'isManager must be true or false.',
      );
    }

    return value;
  }

  private async findAgent(id: string): Promise<UserRow> {
    const rows = await this.dataSource.query(
      `
      SELECT
        id,
        email,
        full_name AS fullName,
        role,
        status,
        department,
        is_manager AS isManager,
        created_at AS createdAt
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    const user = rows[0] as UserRow | undefined;

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const originalAdminId =
  this.config.getOrThrow<string>('ORIGINAL_ADMIN_ID');

if (
  !/^[1-9]\d*$/.test(originalAdminId) ||
  String(user.id) === originalAdminId ||
  user.role !== 'agent'
) {
      throw new BadRequestException(
        'The original administrator cannot be managed here.',
      );
    }

    return user;
  }

  async findAll(search?: unknown) {
    let where = '';
    const parameters: unknown[] = [];

    if (search !== undefined && search !== null && search !== '') {
      if (typeof search !== 'string') {
        throw new BadRequestException('Invalid search value.');
      }

      const term = `%${search.trim()}%`;
      where = `
        WHERE email LIKE ?
           OR full_name LIKE ?
           OR department LIKE ?
      `;
      parameters.push(term, term, term);
    }

    return this.dataSource.query(
      `
      SELECT
        id,
        email,
        full_name AS fullName,
        role,
        status,
        department,
        is_manager AS isManager,
        created_at AS createdAt
      FROM users
      ${where}
      ORDER BY id ASC
      `,
      parameters,
    );
  }

  async create(body: Record<string, unknown>) {
    const email = this.normalizeEmail(body.email);
    const fullName = this.normalizeFullName(body.fullName);
    const password = this.normalizePassword(body.password);
    const department = this.normalizeDepartment(body.department);
    const isManager =
      body.isManager === undefined
        ? false
        : this.normalizeManager(body.isManager);

    const existing = await this.dataSource.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email],
    );

    if (existing.length > 0) {
      throw new ConflictException('This email is already registered.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const result = await this.dataSource.query(
        `
        INSERT INTO users (
          email,
          password_hash,
          full_name,
          role,
          status,
          department,
          is_manager,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 'agent', 'active', ?, ?, NOW(), NOW())
        `,
        [
          email,
          passwordHash,
          fullName,
          department,
          isManager ? 1 : 0,
        ],
      );

      return this.findAgent(String(result.insertId));
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ER_DUP_ENTRY'
      ) {
        throw new ConflictException(
          'This email is already registered.',
        );
      }

      throw error;
    }
  }

  async update(id: string, body: Record<string, unknown>) {
    await this.findAgent(id);

    const allowedFields = [
      'email',
      'fullName',
      'department',
      'isManager',
    ];

    if (
      !Object.keys(body).some((key) => allowedFields.includes(key))
    ) {
      throw new BadRequestException('No valid fields provided.');
    }

    const updates: string[] = [];
    const parameters: unknown[] = [];

    if (body.email !== undefined) {
      updates.push('email = ?');
      parameters.push(this.normalizeEmail(body.email));
    }

    if (body.fullName !== undefined) {
      updates.push('full_name = ?');
      parameters.push(this.normalizeFullName(body.fullName));
    }

    if (body.department !== undefined) {
      updates.push('department = ?');
      parameters.push(this.normalizeDepartment(body.department));
    }

    if (body.isManager !== undefined) {
      updates.push('is_manager = ?');
      parameters.push(
        this.normalizeManager(body.isManager) ? 1 : 0,
      );
    }

    updates.push('updated_at = NOW()');
    parameters.push(id);

    try {
      await this.dataSource.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        parameters,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ER_DUP_ENTRY'
      ) {
        throw new ConflictException(
          'This email is already registered.',
        );
      }

      throw error;
    }

    return this.findAgent(id);
  }

  async updateStatus(id: string, status: unknown) {
    await this.findAgent(id);

    if (status !== 'active' && status !== 'suspended') {
      throw new BadRequestException(
        'Status must be active or suspended.',
      );
    }

    await this.dataSource.query(
      `
      UPDATE users
      SET status = ?, updated_at = NOW()
      WHERE id = ?
      `,
      [status, id],
    );

    return this.findAgent(id);
  }

  async resetPassword(id: string, passwordValue: unknown) {
    await this.findAgent(id);

    const password = this.normalizePassword(passwordValue);
    const passwordHash = await bcrypt.hash(password, 12);

    await this.dataSource.query(
      `
      UPDATE users
      SET password_hash = ?, updated_at = NOW()
      WHERE id = ?
      `,
      [passwordHash, id],
    );

    return { message: 'Password updated successfully.' };
  }
}