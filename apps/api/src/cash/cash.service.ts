import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CashMovementType, CashRegisterStatus, PaymentMethod } from '@prisma/client';
import { AdminPasswordService } from '../auth/admin-password.service';
import { AuditService } from '../audit/audit.service';
import { dec, sum } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CashMovementDto, CloseCashDto, OpenCashDto } from './dto/cash.dto';

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly adminPassword: AdminPasswordService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Caixa aberto de UM atendente no evento (um caixa aberto por atendente por vez). */
  findOpenForOperator(eventId: string, userId: string) {
    return this.prisma.cashRegister.findFirst({
      where: { eventId, openedById: userId, status: CashRegisterStatus.ABERTO },
    });
  }

  async open(eventId: string, userId: string, companyId: string, dto: OpenCashDto) {
    const existing = await this.findOpenForOperator(eventId, userId);
    if (existing) {
      throw new ConflictException('Você já tem um caixa aberto neste evento');
    }
    const register = await this.prisma.cashRegister.create({
      data: { eventId, openedById: userId, openingAmount: dec(dto.openingAmount) },
    });
    await this.audit.record({
      action: 'CASH_OPEN',
      userId,
      companyId,
      eventId,
      entity: 'CashRegister',
      entityId: register.id,
      amount: register.openingAmount.toNumber(),
    });
    return register;
  }

  async close(eventId: string, registerId: string, userId: string, companyId: string, dto: CloseCashDto) {
    // Fechamento de caixa é ação crítica: só admin, com senha administrativa.
    await this.adminPassword.assertValid(eventId, dto.adminPassword, { userId, companyId });
    const register = await this.requireRegister(eventId, registerId);
    if (register.status === CashRegisterStatus.FECHADO) {
      throw new ConflictException('Caixa já está fechado');
    }
    const closed = await this.prisma.cashRegister.update({
      where: { id: register.id },
      data: {
        status: CashRegisterStatus.FECHADO,
        closingAmount: dec(dto.closingAmount),
        closedAt: new Date(),
      },
    });
    await this.audit.record({
      action: 'CASH_CLOSE',
      userId,
      companyId,
      eventId,
      entity: 'CashRegister',
      entityId: register.id,
      amount: closed.closingAmount?.toNumber() ?? null,
    });
    return this.summary(eventId, register.id);
  }

  /** Fecha TODOS os caixas abertos do evento (fim de evento). Só admin + senha admin. */
  async closeAll(eventId: string, userId: string, companyId: string, adminPassword: string) {
    await this.adminPassword.assertValid(eventId, adminPassword, { userId, companyId });
    const open = await this.prisma.cashRegister.findMany({
      where: { eventId, status: CashRegisterStatus.ABERTO },
    });

    let closed = 0;
    for (const register of open) {
      const summary = await this.summary(eventId, register.id);
      await this.prisma.cashRegister.update({
        where: { id: register.id },
        data: {
          status: CashRegisterStatus.FECHADO,
          closingAmount: summary.expectedInDrawer,
          closedAt: new Date(),
        },
      });
      await this.audit.record({
        action: 'CASH_CLOSE',
        userId,
        companyId,
        eventId,
        entity: 'CashRegister',
        entityId: register.id,
        amount: summary.expectedInDrawer.toNumber(),
        metadata: { via: 'close-all' },
      });
      closed += 1;
    }
    return { closed };
  }

  async movement(
    eventId: string,
    registerId: string,
    type: CashMovementType,
    userId: string,
    companyId: string,
    dto: CashMovementDto,
  ) {
    await this.adminPassword.assertValid(eventId, dto.adminPassword, { userId, companyId });
    const register = await this.requireRegister(eventId, registerId);
    if (register.status !== CashRegisterStatus.ABERTO) {
      throw new ConflictException('Movimentação exige caixa aberto');
    }

    const movement = await this.prisma.cashMovement.create({
      data: {
        cashRegisterId: register.id,
        type,
        amount: dec(dto.amount),
        reason: dto.reason,
        responsibleId: userId,
      },
    });
    await this.audit.record({
      action: type === CashMovementType.SANGRIA ? 'CASH_SANGRIA' : 'CASH_SUPRIMENTO',
      userId,
      companyId,
      eventId,
      entity: 'CashMovement',
      entityId: movement.id,
      amount: movement.amount.toNumber(),
      metadata: { reason: dto.reason },
    });
    this.realtime.publishDashboard(eventId);
    return movement;
  }

  async summary(eventId: string, registerId: string) {
    const register = await this.requireRegister(eventId, registerId);
    const [movements, sales] = await Promise.all([
      this.prisma.cashMovement.findMany({ where: { cashRegisterId: register.id } }),
      this.prisma.sale.findMany({
        where: { cashRegisterId: register.id, status: 'CONCLUIDA' },
        select: { total: true, payments: { select: { method: true, amount: true } } },
      }),
    ]);

    const suprimentos = sum(
      movements.filter((m) => m.type === CashMovementType.SUPRIMENTO).map((m) => m.amount),
    );
    const sangrias = sum(
      movements.filter((m) => m.type === CashMovementType.SANGRIA).map((m) => m.amount),
    );
    const salesTotal = sum(sales.map((s) => s.total));
    // Só o que entra em ESPÉCIE conta para a gaveta. Cartão, PIX e cortesia NÃO
    // caem no caixa físico — somá-los inflava o "esperado" e tornava impossível
    // flagrar desvio de dinheiro (caixa 2). O esperado agora é dinheiro puro.
    const cashSales = sum(
      sales.flatMap((s) =>
        s.payments.filter((p) => p.method === PaymentMethod.DINHEIRO).map((p) => p.amount),
      ),
    );
    const expected = dec(register.openingAmount)
      .plus(cashSales)
      .plus(suprimentos)
      .minus(sangrias);

    return {
      id: register.id,
      status: register.status,
      openingAmount: register.openingAmount,
      closingAmount: register.closingAmount,
      salesTotal,
      cashSales,
      suprimentos,
      sangrias,
      expectedInDrawer: expected,
    };
  }

  private async requireRegister(eventId: string, registerId: string) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id: registerId, eventId },
    });
    if (!register) throw new NotFoundException('Caixa não encontrado');
    return register;
  }
}
