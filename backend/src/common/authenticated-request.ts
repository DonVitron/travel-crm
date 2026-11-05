
import type { Request } from 'express';

export type UserRole = 'admin' | 'agent';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  department?: string | null;
  isManager?: boolean;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};
