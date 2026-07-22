import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { AdminPasswordService } from '../auth/admin-password.service';
import { AuditService } from '../audit/audit.service';
import { DecimalInput, dec, sum } from '../common/money';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CancelSaleDto } from './dto/sales.dto';

export interface SaleLine {
  productId: string;
  quantity: number;
}

export interface FinalizeSaleInput {
  eventId: string;
  companyId: string;
  operatorId: string;
  clientId: string;
  machineId?: string;
  tabId?: string;
  lines: SaleLine[];
  payments: { method: PaymentMethod; amount: DecimalInput }[];
  applyServiceFee: boolean;
  adminPassword?: string;
}

const saleInclude = {
  items: { include: { product: true } },
  payments: true,
  refund: true,
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly adminPassword: AdminPasswordService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Finaliza uma venda (avulsa ou fechamento de comanda). Garante:
   * - não há venda sem caixa aberto (PLAN §6.2);
   * - idempotência por (eventId, clientId) — venda offline nunca duplica (ADR-04);
   * - baixa de estoque + ficha técnica em transação;
   * - soma dos pagamentos = total;
   * - taxa de serviço aplicada quando solicitado e habilitada no evento.
   */
  async finalize(input: FinalizeSaleInput) {
    const existing = await this.prisma.sale.findUnique({
      where: { eventId_clientId: { eventId: input.eventId, clientId: input.clientId } },
      include: saleInclude,
    });
    if (existing) {
      return existing; // idempotente
    }

    const register = await this.prisma.cashRegister.findFirst({
      where: { eventId: input.eventId, status: 'ABERTO', openedById: input.operatorId },
    });
    if (!register) {
      throw new ConflictException('Abra o seu caixa antes de vender');
    }

    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: input.eventId } });

    // Carrega produtos do evento e monta as linhas com preço "congelado".
    const productIds = input.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, eventId: input.eventId, active: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = dec(0);
    const itemsData = input.lines.map((line) => {
      const product = byId.get(line.productId);
      if (!product) {
        throw new BadRequestException(`Produto inválido para o evento: ${line.productId}`);
      }
      const unitPrice = dec(product.price);
      subtotal = subtotal.plus(unitPrice.times(line.quantity));
      return {
        productId: product.id,
        quantity: line.quantity,
        unitPrice,
        isCourtesy: false,
      };
    });

    const serviceFee =
      input.applyServiceFee && event.serviceFeeEnabled
        ? subtotal.times(dec(event.serviceFeePercent)).div(100)
        : dec(0);
    const total = subtotal.plus(serviceFee);

    const paymentsTotal = sum(input.payments.map((p) => p.amount));
    if (!paymentsTotal.equals(total)) {
      throw new BadRequestException(
        `Soma dos pagamentos (${paymentsTotal.toFixed(2)}) difere do total (${total.toFixed(2)})`,
      );
    }

    // Cortesia (brinde) exige a senha administrativa do evento.
    const hasCourtesy = input.payments.some((p) => p.method === PaymentMethod.CORTESIA);
    if (hasCourtesy) {
      if (!input.adminPassword) {
        throw new BadRequestException('Cortesia exige a senha administrativa do evento');
      }
      await this.adminPassword.assertValid(input.eventId, input.adminPassword);
    }

    // Processa pagamentos pela camada de abstração (Strategy).
    for (const payment of input.payments) {
      const result = await this.payments.process({
        eventId: input.eventId,
        method: payment.method,
        amount: dec(payment.amount),
      });
      if (!result.approved) {
        throw new BadRequestException(`Pagamento não aprovado (${payment.method})`);
      }
    }

    const sale = await this.prisma
      .$transaction(async (tx) => {
        await this.inventory.applyConsumption(tx, input.lines);

        const created = await tx.sale.create({
          data: {
            eventId: input.eventId,
            clientId: input.clientId,
            cashRegisterId: register.id,
            tabId: input.tabId,
            operatorId: input.operatorId,
            machineId: input.machineId,
            subtotal,
            serviceFee,
            total,
            items: { create: itemsData },
            payments: {
              create: input.payments.map((p) => ({ method: p.method, amount: dec(p.amount) })),
            },
          },
          include: saleInclude,
        });

        if (input.tabId) {
          await tx.tab.update({
            where: { id: input.tabId },
            data: { status: 'FECHADA', closedAt: new Date() },
          });
        }

        return created;
      })
      .catch((error: unknown) => {
        // Corrida de idempotência: outro request criou a mesma venda.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return this.prisma.sale.findUniqueOrThrow({
            where: { eventId_clientId: { eventId: input.eventId, clientId: input.clientId } },
            include: saleInclude,
          });
        }
        throw error;
      });

    await this.audit.record({
      action: 'SALE_CREATE',
      userId: input.operatorId,
      companyId: input.companyId,
      eventId: input.eventId,
      machineId: input.machineId ?? null,
      entity: 'Sale',
      entityId: sale.id,
      amount: total.toNumber(),
      metadata: { clientId: input.clientId, tabId: input.tabId ?? null },
    });

    this.realtime.publishDashboard(input.eventId);
    return sale;
  }

  listSales(eventId: string) {
    return this.prisma.sale.findMany({
      where: { eventId },
      include: saleInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSale(eventId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, eventId },
      include: saleInclude,
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    return sale;
  }

  /** Cancelamento/estorno: somente admin + senha admin. Estorna estoque e gera Refund. */
  async cancel(eventId: string, saleId: string, userId: string, companyId: string, dto: CancelSaleDto) {
    await this.adminPassword.assertValid(eventId, dto.adminPassword);

    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, eventId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.status === 'CANCELADA') {
      throw new ConflictException('Venda já está cancelada');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.inventory.revertConsumption(
        tx,
        sale.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      );
      await tx.sale.update({ where: { id: sale.id }, data: { status: 'CANCELADA' } });
      await tx.refund.create({
        data: {
          saleId: sale.id,
          reason: dto.reason,
          amount: sale.total,
          responsibleId: userId,
        },
      });
    });

    await this.audit.record({
      action: 'SALE_REFUND',
      userId,
      companyId,
      eventId,
      entity: 'Sale',
      entityId: sale.id,
      amount: dec(sale.total).toNumber(),
      metadata: { reason: dto.reason },
    });

    this.realtime.publishDashboard(eventId);
    return this.getSale(eventId, sale.id);
  }
}
