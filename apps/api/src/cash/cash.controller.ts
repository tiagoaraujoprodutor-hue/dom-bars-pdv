import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CashMovementType, Role } from '@prisma/client';
import { AuthUser, EventScope } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EventScopeParam } from '../auth/decorators/event-role.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { EventScopeGuard } from '../auth/guards/event-scope.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CashService } from './cash.service';
import {
  CashMovementDto,
  CloseAllDto,
  CloseCashDto,
  OpenCashDto,
  cashMovementSchema,
  closeAllSchema,
  closeCashSchema,
  openCashSchema,
} from './dto/cash.dto';

@ApiTags('Caixa')
@ApiBearerAuth()
@Controller('events/:eventId/cash-registers')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class CashController {
  constructor(private readonly cash: CashService) {}

  /** Caixa aberto do próprio usuário (cada atendente tem o seu). */
  @Get('current')
  current(@EventScopeParam() scope: EventScope, @CurrentUser() user: AuthUser) {
    return this.cash.findOpenForOperator(scope.eventId, user.userId);
  }

  /** Cada atendente abre o seu próprio caixa (valor inicial). */
  @Post('open')
  open(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(openCashSchema)) dto: OpenCashDto,
  ) {
    return this.cash.open(scope.eventId, user.userId, user.companyId, dto);
  }

  @Get(':id/summary')
  @Roles(Role.SUPERVISOR, Role.ADMINISTRADOR)
  summary(@EventScopeParam() scope: EventScope, @Param('id') id: string) {
    return this.cash.summary(scope.eventId, id);
  }

  /** Fecha todos os caixas abertos do evento (fim de evento). Admin + senha admin. */
  @Post('close-all')
  @Roles(Role.ADMINISTRADOR)
  closeAll(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(closeAllSchema)) dto: CloseAllDto,
  ) {
    return this.cash.closeAll(scope.eventId, user.userId, user.companyId, dto.adminPassword);
  }

  @Post(':id/close')
  @Roles(Role.ADMINISTRADOR)
  close(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeCashSchema)) dto: CloseCashDto,
  ) {
    return this.cash.close(scope.eventId, id, user.userId, user.companyId, dto);
  }

  @Post(':id/sangria')
  @Roles(Role.ADMINISTRADOR)
  sangria(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cashMovementSchema)) dto: CashMovementDto,
  ) {
    return this.cash.movement(
      scope.eventId,
      id,
      CashMovementType.SANGRIA,
      user.userId,
      user.companyId,
      dto,
    );
  }

  @Post(':id/suprimento')
  @Roles(Role.ADMINISTRADOR)
  suprimento(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cashMovementSchema)) dto: CashMovementDto,
  ) {
    return this.cash.movement(
      scope.eventId,
      id,
      CashMovementType.SUPRIMENTO,
      user.userId,
      user.companyId,
      dto,
    );
  }
}
