import { Role } from '@prisma/client';
import { Request } from 'express';

export interface AuthUser {
  userId: string;
  companyId: string;
  email: string;
}

export interface JwtAccessPayload {
  sub: string;
  companyId: string;
  email: string;
}

export interface JwtRefreshPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

export interface EventScope {
  eventId: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  eventScope?: EventScope;
}
