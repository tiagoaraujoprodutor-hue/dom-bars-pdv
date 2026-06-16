import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminPasswordService } from '../auth/admin-password.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, EventScope } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EventScopeParam } from '../auth/decorators/event-role.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { EventScopeGuard } from '../auth/guards/event-scope.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminActionDto, adminActionSchema } from './dto/admin-action.dto';

/**
 * Endpoints de demonstração/validação da Fase 1 (escopo de evento, RBAC, senha
 * admin e auditoria). A gestão completa de eventos chega na Fase 2/3.
 */
@Controller('events/:eventId')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class EventsController {
  constructor(
    private readonly adminPassword: AdminPasswordService,
    private readonly audit: AuditService,
  ) {}

  /** Qualquer membro do evento: prova o isolamento por escopo. */
  @Get('membership')
  membership(@EventScopeParam() scope: EventScope) {
    return { eventId: scope.eventId, role: scope.role };
  }

  /** Supervisor e Administrador: relatórios operacionais (PLAN §7). */
  @Get('reports')
  @Roles(Role.SUPERVISOR, Role.ADMINISTRADOR)
  reports(@EventScopeParam() scope: EventScope) {
    return { eventId: scope.eventId, ok: true };
  }

  /** Ação crítica: somente Administrador + senha administrativa + auditoria. */
  @Post('admin-action')
  @Roles(Role.ADMINISTRADOR)
  async adminAction(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(adminActionSchema)) dto: AdminActionDto,
  ) {
    await this.adminPassword.assertValid(eventId, dto.adminPassword);
    await this.audit.record({
      action: 'ADMIN_ACTION',
      userId: user.userId,
      companyId: user.companyId,
      eventId,
      entity: 'Event',
      entityId: eventId,
      metadata: { reason: dto.reason },
    });
    return { ok: true };
  }
}
