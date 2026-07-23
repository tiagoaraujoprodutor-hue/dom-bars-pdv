import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CashService } from '../cash/cash.service';
import { dec } from '../common/money';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportSpec, renderPdf } from './pdf.util';

function fmt(value: Prisma.Decimal | string | number | null | undefined): string {
  return Number(value ?? 0).toFixed(2);
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly cash: CashService,
  ) {}

  render(spec: ReportSpec): Promise<Buffer> {
    return renderPdf(spec);
  }

  private async eventName(eventId: string): Promise<string> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { name: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');
    return event.name;
  }

  async cashClosing(eventId: string, registerId: string): Promise<ReportSpec> {
    const [name, summary, movements] = await Promise.all([
      this.eventName(eventId),
      this.cash.summary(eventId, registerId),
      this.prisma.cashMovement.findMany({
        where: { cashRegisterId: registerId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      title: 'Fechamento de Caixa',
      subtitle: `${name} · caixa ${registerId}`,
      sections: [
        {
          heading: 'Resumo',
          columns: ['Item', 'Valor (R$)'],
          rows: [
            ['Abertura', fmt(summary.openingAmount)],
            ['Vendas (total)', fmt(summary.salesTotal)],
            ['Vendas em dinheiro', fmt(summary.cashSales)],
            ['Suprimentos', fmt(summary.suprimentos)],
            ['Sangrias', `-${fmt(summary.sangrias)}`],
            ['Fechamento informado', fmt(summary.closingAmount)],
          ],
          total: ['Esperado em gaveta (dinheiro)', fmt(summary.expectedInDrawer)],
        },
        {
          heading: 'Movimentações',
          columns: ['Tipo', 'Motivo', 'Valor (R$)'],
          rows: movements.map((m) => [m.type, m.reason, fmt(m.amount)]),
        },
      ],
    };
  }

  async salesByOperator(eventId: string): Promise<ReportSpec> {
    const snap = await this.dashboard.snapshot(eventId);
    return {
      title: 'Vendas por Operador',
      subtitle: snap.eventId,
      sections: [
        {
          heading: 'Operadores',
          columns: ['Operador', 'Vendas', 'Total (R$)'],
          rows: snap.porOperador.map((o) => [o.nome, o.vendas, o.total]),
          total: ['Total', snap.totalVendas, snap.faturamentoBruto],
        },
      ],
    };
  }

  async salesByMachine(eventId: string): Promise<ReportSpec> {
    const snap = await this.dashboard.snapshot(eventId);
    return {
      title: 'Vendas por Máquina',
      sections: [
        {
          heading: 'Máquinas',
          columns: ['Máquina', 'Vendas', 'Total (R$)'],
          rows: snap.porMaquina.map((m) => [m.machineId, m.vendas, m.total]),
        },
      ],
    };
  }

  async salesByProduct(eventId: string): Promise<ReportSpec> {
    const rows = await this.prisma.$queryRaw<
      { name: string; qty: bigint; revenue: Prisma.Decimal }[]
    >`
      SELECT p.name AS name, SUM(si.quantity) AS qty, SUM(si.quantity * si."unitPrice") AS revenue
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      WHERE s."eventId" = ${eventId} AND s.status = 'CONCLUIDA'
      GROUP BY p.name ORDER BY qty DESC`;

    return {
      title: 'Vendas por Produto',
      sections: [
        {
          heading: 'Produtos',
          columns: ['Produto', 'Qtd', 'Receita (R$)'],
          rows: rows.map((r) => [r.name, Number(r.qty), fmt(r.revenue)]),
        },
      ],
    };
  }

  async payments(eventId: string): Promise<ReportSpec> {
    const snap = await this.dashboard.snapshot(eventId);
    return {
      title: 'Formas de Pagamento',
      sections: [
        {
          heading: 'Recebido por forma',
          columns: ['Forma', 'Total (R$)'],
          rows: snap.porFormaPagamento.map((p) => [p.method, p.total]),
        },
      ],
    };
  }

  async courtesies(eventId: string): Promise<ReportSpec> {
    const list = await this.prisma.courtesy.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      title: 'Cortesias',
      sections: [
        {
          heading: 'Cortesias concedidas',
          columns: ['Beneficiário', 'Motivo', 'Valor (R$)'],
          rows: list.map((c) => [c.beneficiary, c.reason, fmt(c.amount)]),
          total: ['Total', '', fmt(list.reduce((a, c) => a + Number(c.amount), 0))],
        },
      ],
    };
  }

  async refunds(eventId: string): Promise<ReportSpec> {
    const list = await this.prisma.refund.findMany({
      where: { sale: { is: { eventId } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      title: 'Reembolsos / Estornos',
      sections: [
        {
          heading: 'Reembolsos',
          columns: ['Venda', 'Motivo', 'Valor (R$)'],
          rows: list.map((r) => [r.saleId, r.reason, fmt(r.amount)]),
          total: ['Total', '', fmt(list.reduce((a, r) => a + Number(r.amount), 0))],
        },
      ],
    };
  }

  async cashMovements(eventId: string): Promise<ReportSpec> {
    const list = await this.prisma.cashMovement.findMany({
      where: { cashRegister: { is: { eventId } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      title: 'Sangrias e Suprimentos',
      sections: [
        {
          heading: 'Movimentações de caixa',
          columns: ['Tipo', 'Motivo', 'Valor (R$)'],
          rows: list.map((m) => [m.type, m.reason, fmt(m.amount)]),
        },
      ],
    };
  }

  async losses(eventId: string): Promise<ReportSpec> {
    const list = await this.prisma.lossRecord.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      title: 'Controle de Perdas',
      sections: [
        {
          heading: 'Perdas registradas',
          columns: ['Tipo', 'Motivo', 'Quantidade'],
          rows: list.map((l) => [l.type, l.reason, fmt(l.quantity)]),
        },
      ],
    };
  }

  async stock(eventId: string): Promise<ReportSpec> {
    const [products, ingredients] = await Promise.all([
      this.prisma.product.findMany({ where: { eventId }, orderBy: { name: 'asc' } }),
      this.prisma.ingredient.findMany({ where: { eventId }, orderBy: { name: 'asc' } }),
    ]);
    return {
      title: 'Estoque',
      sections: [
        {
          heading: 'Produtos',
          columns: ['Produto', 'Estoque', 'Mínimo'],
          rows: products.map((p) => [p.name, p.stock, p.minStock]),
        },
        {
          heading: 'Insumos',
          columns: ['Insumo', 'Estoque', 'Mínimo'],
          rows: ingredients.map((i) => [
            `${i.name} (${i.unit})`,
            fmt(i.stock),
            fmt(i.minStock),
          ]),
        },
      ],
    };
  }

  /** Fechamento individual de um atendente (por operador). */
  async attendantClosing(eventId: string, userId: string): Promise<ReportSpec> {
    // Só resolve o usuário SE ele for membro DESTE evento — evita vazar nome/CPF
    // (PII/LGPD) de alguém de outra empresa/evento via um userId arbitrário na URL.
    const membership = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId, eventId } },
      select: { user: { select: { name: true, cpf: true } } },
    });
    if (!membership) throw new NotFoundException('Atendente não encontrado');
    const user = membership.user;

    const [agg] = await this.prisma.$queryRaw<{ vendas: bigint; total: Prisma.Decimal }[]>`
      SELECT COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS total FROM "Sale"
      WHERE "eventId" = ${eventId} AND status = 'CONCLUIDA' AND "operatorId" = ${userId}`;

    const pays = await this.prisma.$queryRaw<{ method: string; total: Prisma.Decimal }[]>`
      SELECT p.method AS method, COALESCE(SUM(p.amount), 0) AS total FROM "Payment" p
      JOIN "Sale" s ON s.id = p."saleId"
      WHERE s."eventId" = ${eventId} AND s.status = 'CONCLUIDA' AND s."operatorId" = ${userId}
      GROUP BY p.method`;

    const [cash] = await this.prisma.$queryRaw<
      { inicial: Prisma.Decimal; sangrias: Prisma.Decimal; suprimentos: Prisma.Decimal }[]
    >`
      SELECT
        COALESCE((SELECT SUM("openingAmount") FROM "CashRegister"
                  WHERE "eventId" = ${eventId} AND "openedById" = ${userId}), 0) AS inicial,
        COALESCE((SELECT SUM(m.amount) FROM "CashMovement" m JOIN "CashRegister" r ON r.id = m."cashRegisterId"
                  WHERE r."eventId" = ${eventId} AND r."openedById" = ${userId} AND m.type = 'SANGRIA'), 0) AS sangrias,
        COALESCE((SELECT SUM(m.amount) FROM "CashMovement" m JOIN "CashRegister" r ON r.id = m."cashRegisterId"
                  WHERE r."eventId" = ${eventId} AND r."openedById" = ${userId} AND m.type = 'SUPRIMENTO'), 0) AS suprimentos`;

    const dinheiro = pays.find((p) => p.method === 'DINHEIRO')?.total ?? new Prisma.Decimal(0);
    const esperado =
      Number(cash?.inicial ?? 0) +
      Number(dinheiro) +
      Number(cash?.suprimentos ?? 0) -
      Number(cash?.sangrias ?? 0);

    return {
      title: 'Fechamento do Atendente',
      subtitle: `${user.name}${user.cpf ? ` · CPF ${user.cpf}` : ''}`,
      sections: [
        {
          heading: 'Resumo',
          columns: ['Item', 'Valor'],
          rows: [
            ['Vendas', Number(agg?.vendas ?? 0)],
            ['Total (R$)', fmt(agg?.total)],
          ],
        },
        {
          heading: 'Por forma de pagamento',
          columns: ['Forma', 'Total (R$)'],
          rows: pays.map((p) => [p.method, fmt(p.total)]),
        },
        {
          heading: 'Conciliação de caixa',
          columns: ['Item', 'Valor (R$)'],
          rows: [
            ['Caixa inicial', fmt(cash?.inicial)],
            ['Vendas em dinheiro', fmt(dinheiro)],
            ['Suprimentos', fmt(cash?.suprimentos)],
            ['Sangrias', `-${fmt(cash?.sangrias)}`],
          ],
          total: ['Caixa esperado', esperado.toFixed(2)],
        },
      ],
    };
  }

  /**
   * Apuração financeira do evento: faturamento, custo dos produtos vendidos
   * (soma de quantidade × custo de compra nas vendas concluídas) e lucro bruto.
   */
  async financialSummary(eventId: string): Promise<{
    faturamento: string;
    custo: string;
    lucro: string;
    margem: string;
  }> {
    const snap = await this.dashboard.snapshot(eventId);
    const [row] = await this.prisma.$queryRaw<{ custo: Prisma.Decimal | null }[]>`
      SELECT COALESCE(SUM(si.quantity * p."costPrice"), 0) AS custo
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      WHERE s."eventId" = ${eventId} AND s.status = 'CONCLUIDA'`;

    const faturamento = dec(snap.faturamentoBruto);
    const custo = dec(row?.custo ?? 0);
    const lucro = faturamento.minus(custo);
    const margem = faturamento.gt(0) ? lucro.div(faturamento).times(100) : dec(0);

    return {
      faturamento: fmt(faturamento),
      custo: fmt(custo),
      lucro: fmt(lucro),
      margem: margem.toFixed(1),
    };
  }

  /** Lucratividade por produto: receita, custo, lucro e margem de cada item. */
  async profitByProduct(eventId: string): Promise<ReportSpec> {
    const rows = await this.prisma.$queryRaw<
      { name: string; qty: bigint; revenue: Prisma.Decimal; cost: Prisma.Decimal }[]
    >`
      SELECT p.name AS name,
             SUM(si.quantity) AS qty,
             SUM(si.quantity * si."unitPrice") AS revenue,
             SUM(si.quantity * p."costPrice") AS cost
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      WHERE s."eventId" = ${eventId} AND s.status = 'CONCLUIDA'
      GROUP BY p.name ORDER BY (SUM(si.quantity * si."unitPrice") - SUM(si.quantity * p."costPrice")) DESC`;

    return {
      title: 'Lucratividade por Produto',
      sections: [
        {
          heading: 'Produtos',
          columns: ['Produto', 'Qtd', 'Receita (R$)', 'Custo (R$)', 'Lucro (R$)', 'Margem (%)'],
          rows: rows.map((r) => {
            const revenue = dec(r.revenue);
            const cost = dec(r.cost);
            const lucro = revenue.minus(cost);
            const margem = revenue.gt(0) ? lucro.div(revenue).times(100) : dec(0);
            return [r.name, Number(r.qty), fmt(revenue), fmt(cost), fmt(lucro), margem.toFixed(1)];
          }),
        },
      ],
    };
  }

  /** Relatório geral — consolidação do evento (usado no fechamento). */
  async general(eventId: string): Promise<ReportSpec> {
    const [name, snap, perdas, fin] = await Promise.all([
      this.eventName(eventId),
      this.dashboard.snapshot(eventId),
      this.prisma.lossRecord.count({ where: { eventId } }),
      this.financialSummary(eventId),
    ]);

    return {
      title: 'Relatório Geral do Evento',
      subtitle: name,
      sections: [
        {
          heading: 'Consolidação',
          columns: ['Indicador', 'Valor'],
          rows: [
            ['Faturamento bruto (R$)', snap.faturamentoBruto],
            ['Custo dos produtos vendidos (R$)', fin.custo],
            ['Lucro bruto (R$)', fin.lucro],
            ['Margem de lucro (%)', fin.margem],
            ['Total de vendas', snap.totalVendas],
            ['Ticket médio (R$)', snap.ticketMedio],
            ['Comandas abertas', snap.comandas.abertas],
            ['Comandas fechadas', snap.comandas.fechadas],
            ['Sangrias (R$)', snap.sangrias],
            ['Cortesias (R$)', `${snap.cortesias.total} (${snap.cortesias.quantidade})`],
            ['Perdas registradas', perdas],
          ],
        },
        {
          heading: 'Por operador',
          columns: ['Operador', 'Vendas', 'Total (R$)'],
          rows: snap.porOperador.map((o) => [o.nome, o.vendas, o.total]),
        },
        {
          heading: 'Por forma de pagamento',
          columns: ['Forma', 'Total (R$)'],
          rows: snap.porFormaPagamento.map((p) => [p.method, p.total]),
        },
        {
          heading: 'Produtos mais vendidos',
          columns: ['Produto', 'Quantidade'],
          rows: snap.produtosMaisVendidos.map((p) => [p.nome, p.quantidade]),
        },
      ],
    };
  }
}
