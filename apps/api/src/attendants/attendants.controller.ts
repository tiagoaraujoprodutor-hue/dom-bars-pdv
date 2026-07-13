import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, EventScope } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EventScopeParam } from '../auth/decorators/event-role.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { EventScopeGuard } from '../auth/guards/event-scope.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AttendantsService } from './attendants.service';
import {
  CreateAttendantDto,
  UpdateAttendantDto,
  createAttendantSchema,
  updateAttendantSchema,
} from './attendants.dto';

/**
 * Gestão de atendentes por evento (login por CPF, senha com validade). Somente
 * Administrador. O fechamento por atendente sai dos relatórios "por operador".
 */
@ApiTags('Atendentes')
@ApiBearerAuth()
@Controller('events/:eventId/attendants')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
export class AttendantsController {
  constructor(private readonly attendants: AttendantsService) {}

  @Get()
  list(@EventScopeParam() scope: EventScope) {
    return this.attendants.list(scope.eventId);
  }

  /** Fechamento por atendente (busca opcional por CPF). Supervisor também acessa. */
  @Get('closing')
  @Roles(Role.SUPERVISOR, Role.ADMINISTRADOR)
  closing(@EventScopeParam() scope: EventScope, @Query('cpf') cpf?: string) {
    return this.attendants.closing(scope.eventId, cpf);
  }

  @Post()
  create(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAttendantSchema)) dto: CreateAttendantDto,
  ) {
    return this.attendants.create(scope.eventId, user.companyId, user.userId, dto);
  }

  @Patch(':userId')
  update(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateAttendantSchema)) dto: UpdateAttendantDto,
  ) {
    return this.attendants.update(scope.eventId, userId, user.companyId, user.userId, dto);
  }
}
