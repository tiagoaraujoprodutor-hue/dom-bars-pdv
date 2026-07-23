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
import { AdminPasswordService } from '../auth/admin-password.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  CancelSaleDto,
  CreateSaleDto,
  ManageDto,
  cancelSaleSchema,
  createSaleSchema,
  manageSchema,
} from './dto/sales.dto';
import { SalesService } from './sales.service';

@ApiTags('Vendas')
@ApiBearerAuth()
@Controller('events/:eventId/sales')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly adminPassword: AdminPasswordService,
  ) {}

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

  /**
   * Aba de gestão de pedidos (app): lista os pedidos com nome do atendente,
   * itens, valores, hora, forma de pagamento e reimpressões. Liberada a qualquer
   * membro do evento MEDIANTE a senha administrativa (o admin abre a aba na
   * máquina da atendente).
   */
  @Post('manage')
  async manage(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(manageSchema)) dto: ManageDto,
  ) {
    await this.adminPassword.assertValid(scope.eventId, dto.adminPassword, {
      userId: user.userId,
      companyId: user.companyId,
    });
    return this.sales.listSalesManaged(scope.eventId);
  }

  /** Reimpressão da ficha (registrada no sistema) — exige a senha admin. */
  @Post(':id/reprint')
  async reprint(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(manageSchema)) dto: ManageDto,
  ) {
    await this.adminPassword.assertValid(scope.eventId, dto.adminPassword, {
      userId: user.userId,
      companyId: user.companyId,
    });
    return this.sales.reprint(scope.eventId, id, user.userId, user.companyId);
  }

  /**
   * Estorno/cancelamento: exige a senha administrativa do evento. Liberado a
   * qualquer membro que apresente a senha admin (o admin autoriza na máquina),
   * validado no serviço via AdminPasswordService.
   */
  @Post(':id/cancel')
  cancel(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelSaleSchema)) dto: CancelSaleDto,
  ) {
    return this.sales.cancel(scope.eventId, id, user.userId, user.companyId, dto);
  }
}
