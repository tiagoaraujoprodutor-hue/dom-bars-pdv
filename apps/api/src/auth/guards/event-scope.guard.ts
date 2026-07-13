import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from '../auth.types';

/**
 * Garante o isolamento multi-tenant: o usuário autenticado só acessa um evento
 * do qual é membro. Resolve o papel (Role) dentro daquele evento e o anexa à
 * request para o RolesGuard. Nunca confia no frontend (ver PLAN §2, ADR-01).
 */
@Injectable()
export class EventScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const eventId =
      (request.params as Record<string, string> | undefined)?.eventId ??
      (request.headers['x-event-id'] as string | undefined);

    if (!eventId) {
      throw new ForbiddenException('Evento não informado');
    }

    const membership = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: user.userId, eventId } },
    });

    if (!membership) {
      throw new ForbiddenException('Sem acesso a este evento');
    }
    // Controle do Admin sobre atendentes: desativação e validade por evento.
    if (!membership.active) {
      throw new ForbiddenException('Acesso desativado para este evento');
    }
    if (membership.expiresAt && membership.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Acesso expirado para este evento');
    }

    request.eventScope = { eventId, role: membership.role };
    return true;
  }
}
