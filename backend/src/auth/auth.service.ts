import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import bcrypt from 'bcryptjs';

type AuthUser = {
  id: string | number | bigint;
  email: string;
  passwordHash: string;
  fullName: string;
  role: 'admin' | 'agent';
  status: 'active' | 'suspended';
};

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: unknown, password: unknown) {
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const users = (await this.dataSource.query(
      `SELECT
        id,
        email,
        password_hash AS passwordHash,
        full_name AS fullName,
        role,
        status
      FROM users
      WHERE email = ?
      LIMIT 1`,
      [email.trim().toLowerCase()],
    )) as AuthUser[];

    const user = users[0];

    if (
      !user ||
      user.status !== 'active' ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: String(user.id),
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: String(user.id),
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
