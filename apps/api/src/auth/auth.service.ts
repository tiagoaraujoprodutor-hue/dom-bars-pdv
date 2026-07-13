import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import { normalizeCpf } from '../common/cpf';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthUser,
  JwtAccessPayload,
  JwtRefreshPayload,
} from './auth.types';
import { randomUUID } from 'node:crypto';
import { sha256, verifyPassword } from './password.util';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  user: {
    id: string;
    name: string;
    email: string | null;
    companyId: string;
    memberships: { eventId: string; role: string }[];
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(input: {
    email?: string;
    cpf?: string;
    password: string;
    machineId?: string;
  }): Promise<LoginResult> {
    if (input.cpf) {
      return this.loginByCpf(normalizeCpf(input.cpf), input.password, input.machineId);
    }
    if (input.email) {
      return this.loginByEmail(input.email, input.password, input.machineId);
    }
    throw new UnauthorizedException('Credenciais inválidas');
  }

  /** Login de admin/supervisor por e-mail (senha global do usuário). */
  private async loginByEmail(email: string, password: string, machineId?: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { select: { eventId: true, role: true } } },
    });

    if (
      !user ||
      !user.active ||
      !user.passwordHash ||
      !(await verifyPassword(user.passwordHash, password))
    ) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.finishLogin(user, machineId);
  }

  /**
   * Login de atendente por CPF. A senha fica NA VINCULAÇÃO com o evento
   * (EventMembership) e tem validade/ativação controladas pelo Admin. Se a senha
   * bate mas o acesso está expirado/desativado, bloqueia com mensagem clara.
   */
  private async loginByCpf(cpf: string, password: string, machineId?: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { cpf },
      include: { memberships: true },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    let matched: (typeof user.memberships)[number] | null = null;
    for (const membership of user.memberships) {
      if (membership.passwordHash && (await verifyPassword(membership.passwordHash, password))) {
        matched = membership;
        break;
      }
    }
    if (!matched) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (!matched.active) {
      throw new ForbiddenException('Acesso desativado para este evento. Fale com o administrador.');
    }
    if (matched.expiresAt && matched.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Senha expirada para este evento. Fale com o administrador.');
    }

    return this.finishLogin(
      { ...user, memberships: user.memberships.map((m) => ({ eventId: m.eventId, role: m.role })) },
      machineId,
    );
  }

  private async finishLogin(
    user: {
      id: string;
      name: string;
      email: string | null;
      companyId: string;
      memberships: { eventId: string; role: string }[];
    },
    machineId?: string,
  ): Promise<LoginResult> {
    const tokens = await this.issueTokens({
      userId: user.id,
      companyId: user.companyId,
      email: user.email ?? '',
    });

    await this.audit.record({
      action: 'AUTH_LOGIN',
      userId: user.id,
      companyId: user.companyId,
      machineId: machineId ?? null,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        companyId: user.companyId,
        memberships: user.memberships,
      },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!stored) {
      throw new UnauthorizedException('Refresh token revogado ou expirado');
    }

    // Rotação: invalida o token usado e emite um novo par.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Usuário inválido');
    }

    return this.issueTokens({
      userId: user.id,
      companyId: user.companyId,
      email: user.email ?? '',
    });
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = sha256(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({ action: 'AUTH_LOGOUT', userId });
  }

  private async issueTokens(user: AuthUser): Promise<TokenPair> {
    const accessPayload: JwtAccessPayload = {
      sub: user.userId,
      companyId: user.companyId,
      email: user.email,
    };
    const refreshPayload: JwtRefreshPayload = {
      sub: user.userId,
      type: 'refresh',
      jti: randomUUID(),
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as JwtSignOptions['expiresIn'],
    });

    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '7d') as JwtSignOptions['expiresIn'],
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.userId,
        tokenHash: sha256(refreshToken),
        expiresAt: this.decodeExpiry(refreshToken),
      },
    });

    return { accessToken, refreshToken };
  }

  private decodeExpiry(token: string): Date {
    const decoded = this.jwt.decode(token) as { exp?: number } | null;
    if (decoded?.exp) {
      return new Date(decoded.exp * 1000);
    }
    // Fallback defensivo: 7 dias.
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
}
