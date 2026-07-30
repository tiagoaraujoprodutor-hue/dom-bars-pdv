import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  payments: { method: PaymentMethod; amount: DecimalInput; paymentId?: string }[];
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
    private readonly cfg: ConfigService,
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
      // Idempotência LIGADA AO CONTEÚDO: reenviar a MESMA venda devolve a original
      // (offline-first). Mas reusar o clientId com itens/pagamentos DIFERENTES é
      // recusado (409) — senão um clientId reutilizado colapsaria duas entregas
      // distintas numa venda só (retirar 10, pagar 1). Ver auditoria antifraude.
      this.assertSamePayload(existing, input);
      return existing;
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
      await this.adminPassword.assertValid(input.eventId, input.adminPassword, {
        userId: input.operatorId,
        companyId: input.companyId,
      });
    }

    // Pagamentos: os pré-aprovados (PIX online) são VALIDADOS e amarrados depois
    // (não reprocessa); os demais passam pela camada de abstração (Strategy).
    for (const payment of input.payments) {
      if (payment.paymentId) {
        const pre = await this.prisma.payment.findUnique({ where: { id: payment.paymentId } });
        if (!pre || pre.eventId !== input.eventId || pre.provider !== 'pagbank') {
          throw new BadRequestException('Pagamento PIX inválido para este evento');
        }
        if (pre.status !== 'APROVADO') {
          throw new BadRequestException('Pagamento PIX ainda não foi aprovado');
        }
        if (pre.saleId) {
          throw new ConflictException('Pagamento PIX já vinculado a outra venda');
        }
        if (pre.method !== payment.method || !dec(pre.amount).equals(dec(payment.amount))) {
          throw new BadRequestException('Pagamento PIX diverge da forma/valor informado');
        }
        continue; // não reprocessa — já foi pago no PagBank
      }
      // Com o PagBank ligado, PIX SÓ entra pré-aprovado (via QR). Sem paymentId, o
      // provider manual aprovaria sem cobrança real (buraco contábil) — barra aqui.
      if (payment.method === PaymentMethod.PIX && this.cfg.get<boolean>('PAGBANK_ENABLED')) {
        throw new BadRequestException('PIX deve ser cobrado pelo PagBank (QR) e estar aprovado.');
      }
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
        // Cria a venda PRIMEIRO (sem travar o produto) e baixa o estoque por
        // ÚLTIMO. A baixa (UPDATE ... decrement) trava a linha do produto até o
        // commit; deixando-a no fim, a trava fica aberta por ~1-2ms em vez de
        // durante toda a criação da venda. Isso evita o congestionamento quando
        // muitos atendentes vendem o MESMO produto ao mesmo tempo (60+ máquinas).
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
              // Só cria os pagamentos "novos"; os pré-aprovados (PIX) são amarrados abaixo.
              create: input.payments
                .filter((p) => !p.paymentId)
                .map((p) => ({ method: p.method, amount: dec(p.amount) })),
            },
          },
          include: saleInclude,
        });

        // Amarra os pagamentos PIX pré-aprovados à venda (condicional: só se ainda
        // não vinculados e APROVADO) — preserva o NSU/providerRef p/ conciliação.
        const preApproved = input.payments.filter((p) => p.paymentId);
        for (const p of preApproved) {
          const res = await tx.payment.updateMany({
            where: { id: p.paymentId, saleId: null, status: 'APROVADO', eventId: input.eventId },
            data: { saleId: created.id },
          });
          if (res.count === 0) {
            throw new ConflictException('Pagamento PIX já vinculado ou indisponível');
          }
        }

        if (input.tabId) {
          // Fecha a comanda de forma ATÔMICA e CONDICIONAL (só se ainda ABERTA).
          // Se duas máquinas tentam fechar a mesma comanda ao mesmo tempo, apenas
          // uma vence — a outra recebe 409 e NÃO gera segunda venda (evita cobrança
          // em dobro). A idempotência por clientId cobre reenvios da mesma máquina;
          // esta trava cobre máquinas diferentes fechando a mesma comanda.
          const closed = await tx.tab.updateMany({
            where: { id: input.tabId, status: 'ABERTA' },
            data: { status: 'FECHADA', closedAt: new Date() },
          });
          if (closed.count === 0) {
            throw new ConflictException('Comanda já foi fechada por outra máquina');
          }
        }

        // Baixa de estoque/insumos por último (menor janela de trava). Se faltar
        // estoque, lança e desfaz a venda inteira (atômico).
        await this.inventory.applyConsumption(tx, input.lines);

        // Se amarrou PIX pré-aprovado, re-lê para o retorno incluir esse pagamento.
        if (preApproved.length > 0) {
          return tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: saleInclude });
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

  /**
   * Garante que um reenvio com o mesmo clientId traz EXATAMENTE o mesmo conteúdo
   * (itens + pagamentos). Se divergir, é reuso indevido do identificador → 409.
   */
  private assertSamePayload(
    existing: { items: { productId: string; quantity: number }[]; payments: { method: PaymentMethod; amount: Prisma.Decimal }[] },
    input: FinalizeSaleInput,
  ): void {
    const itemsSig = (items: { productId: string; quantity: number }[]) =>
      items
        .map((i) => `${i.productId}:${i.quantity}`)
        .sort()
        .join('|');
    const paySig = (ps: { method: PaymentMethod; amount: DecimalInput }[]) =>
      ps
        .map((p) => `${p.method}:${dec(p.amount).toFixed(2)}`)
        .sort()
        .join('|');

    const sameItems = itemsSig(existing.items) === itemsSig(input.lines);
    const samePayments = paySig(existing.payments) === paySig(input.payments);
    if (!sameItems || !samePayments) {
      throw new ConflictException(
        'Já existe uma venda com este identificador e conteúdo diferente (clientId reutilizado).',
      );
    }
  }

  listSales(eventId: string) {
    return this.prisma.sale.findMany({
      where: { eventId },
      include: saleInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lista de pedidos para a aba de gestão (app, aberta com senha admin): inclui
   * o NOME do atendente, itens, valores, hora, forma de pagamento e o registro
   * de reimpressão. Limitada às últimas vendas para não pesar no terminal.
   */
  async listSalesManaged(eventId: string) {
    const sales = await this.prisma.sale.findMany({
      where: { eventId },
      include: saleInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const operatorIds = [...new Set(sales.map((s) => s.operatorId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: operatorIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    return sales.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      operatorId: s.operatorId,
      operatorName: nameById.get(s.operatorId) ?? '—',
      machineId: s.machineId,
      total: s.total,
      status: s.status,
      reprintCount: s.reprintCount,
      reprintedAt: s.reprintedAt,
      items: s.items.map((i) => ({
        name: i.product.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        isCourtesy: i.isCourtesy,
      })),
      payments: s.payments.map((p) => ({ method: p.method, amount: p.amount })),
    }));
  }

  /** Registra a reimpressão da ficha (conta + data + auditoria) e devolve a venda. */
  async reprint(eventId: string, saleId: string, userId: string, companyId: string) {
    const sale = await this.prisma.sale.findFirst({ where: { id: saleId, eventId } });
    if (!sale) throw new NotFoundException('Venda não encontrada');

    const updated = await this.prisma.sale.update({
      where: { id: sale.id },
      data: { reprintCount: { increment: 1 }, reprintedAt: new Date() },
      include: saleInclude,
    });

    await this.audit.record({
      action: 'SALE_REPRINT',
      userId,
      companyId,
      eventId,
      entity: 'Sale',
      entityId: sale.id,
      metadata: { reprintCount: updated.reprintCount },
    });

    return updated;
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
    await this.adminPassword.assertValid(eventId, dto.adminPassword, { userId, companyId });

    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, eventId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.status === 'CANCELADA') {
      throw new ConflictException('Venda já está cancelada');
    }

    await this.prisma
      .$transaction(async (tx) => {
        // Cancelamento CONDICIONAL: só vira CANCELADA se ainda estava CONCLUIDA.
        // Dois cancelamentos simultâneos → só um vence; o outro recebe 409 (e não
        // estorna estoque duas vezes nem gera reembolso duplo).
        const changed = await tx.sale.updateMany({
          where: { id: sale.id, status: 'CONCLUIDA' },
          data: { status: 'CANCELADA' },
        });
        if (changed.count === 0) {
          throw new ConflictException('Venda já está cancelada');
        }
        await this.inventory.revertConsumption(
          tx,
          sale.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        );
        await tx.refund.create({
          data: {
            saleId: sale.id,
            reason: dto.reason,
            amount: sale.total,
            responsibleId: userId,
          },
        });
      })
      .catch((error: unknown) => {
        // Corrida no reembolso (Refund.saleId @unique): trata como 409, não 500.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Venda já está cancelada');
        }
        throw error;
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
