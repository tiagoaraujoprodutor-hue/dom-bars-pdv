import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
import {
  CancelSaleDto,
  CreateSaleDto,
  cancelSaleSchema,
  createSaleSchema,
} from './dto/sales.dto';
import { SalesService } from './sales.service';

@ApiTags('Vendas')
@ApiBearerAuth()
@Controller('events/:eventId/sales')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  /** Venda avulsa (operador). */
  @Post()
  create(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSaleSchema)) dto: CreateSaleDto,
  ) {
    return this.sales.finalize({
      eventId: scope.eventId,
      companyId: user.companyId,
      operatorId: user.userId,
      clientId: dto.clientId,
      machineId: dto.machineId,
      lines: dto.items,
      payments: dto.payments,
      applyServiceFee: dto.applyServiceFee,
      adminPassword: dto.adminPassword,
    });
  }

  @Get()
  @Roles(Role.SUPERVISOR, Role.ADMINISTRADOR)
  list(@EventScopeParam() scope: EventScope) {
    return this.sales.listSales(scope.eventId);
  }

  @Get(':id')
  get(@EventScopeParam() scope: EventScope, @Param('id') id: string) {
    return this.sales.getSale(scope.eventId, id);
  }

  /** Estorno/reembolso: somente Administrador + senha admin. */
  @Post(':id/cancel')
  @Roles(Role.ADMINISTRADOR)
  cancel(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelSaleSchema)) dto: CancelSaleDto,
  ) {
    return this.sales.cancel(scope.eventId, id, user.userId, user.companyId, dto);
  }
}
