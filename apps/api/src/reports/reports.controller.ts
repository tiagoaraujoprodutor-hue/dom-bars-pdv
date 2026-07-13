import { Controller, Get, Header, Param, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { EventScope } from '../auth/auth.types';
import { EventScopeParam } from '../auth/decorators/event-role.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { EventScopeGuard } from '../auth/guards/event-scope.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReportSpec } from './pdf.util';
import { ReportsService } from './reports.service';

@ApiTags('Relatórios (PDF)')
@ApiBearerAuth()
@Controller('events/:eventId/reports')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
@Roles(Role.SUPERVISOR, Role.ADMINISTRADOR)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private async pdf(name: string, spec: Promise<ReportSpec>): Promise<StreamableFile> {
    const buffer = await this.reports.render(await spec);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${name}.pdf"`,
    });
  }

  @Get('cash/:registerId')
  @Header('Content-Type', 'application/pdf')
  cash(@EventScopeParam() scope: EventScope, @Param('registerId') registerId: string) {
    return this.pdf('fechamento-caixa', this.reports.cashClosing(scope.eventId, registerId));
  }

  @Get('sales-by-operator')
  @Header('Content-Type', 'application/pdf')
  salesByOperator(@EventScopeParam() scope: EventScope) {
    return this.pdf('vendas-por-operador', this.reports.salesByOperator(scope.eventId));
  }

  @Get('sales-by-machine')
  @Header('Content-Type', 'application/pdf')
  salesByMachine(@EventScopeParam() scope: EventScope) {
    return this.pdf('vendas-por-maquina', this.reports.salesByMachine(scope.eventId));
  }

  @Get('sales-by-product')
  @Header('Content-Type', 'application/pdf')
  salesByProduct(@EventScopeParam() scope: EventScope) {
    return this.pdf('vendas-por-produto', this.reports.salesByProduct(scope.eventId));
  }

  @Get('payments')
  @Header('Content-Type', 'application/pdf')
  payments(@EventScopeParam() scope: EventScope) {
    return this.pdf('formas-pagamento', this.reports.payments(scope.eventId));
  }

  @Get('courtesies')
  @Header('Content-Type', 'application/pdf')
  courtesies(@EventScopeParam() scope: EventScope) {
    return this.pdf('cortesias', this.reports.courtesies(scope.eventId));
  }

  @Get('refunds')
  @Header('Content-Type', 'application/pdf')
  refunds(@EventScopeParam() scope: EventScope) {
    return this.pdf('reembolsos', this.reports.refunds(scope.eventId));
  }

  @Get('cash-movements')
  @Header('Content-Type', 'application/pdf')
  cashMovements(@EventScopeParam() scope: EventScope) {
    return this.pdf('sangrias-suprimentos', this.reports.cashMovements(scope.eventId));
  }

  @Get('losses')
  @Header('Content-Type', 'application/pdf')
  losses(@EventScopeParam() scope: EventScope) {
    return this.pdf('perdas', this.reports.losses(scope.eventId));
  }

  @Get('stock')
  @Header('Content-Type', 'application/pdf')
  stock(@EventScopeParam() scope: EventScope) {
    return this.pdf('estoque', this.reports.stock(scope.eventId));
  }

  @Get('attendant/:userId')
  @Header('Content-Type', 'application/pdf')
  attendant(@EventScopeParam() scope: EventScope, @Param('userId') userId: string) {
    return this.pdf('fechamento-atendente', this.reports.attendantClosing(scope.eventId, userId));
  }

  @Get('general')
  @Header('Content-Type', 'application/pdf')
  general(@EventScopeParam() scope: EventScope) {
    return this.pdf('relatorio-geral', this.reports.general(scope.eventId));
  }
}
