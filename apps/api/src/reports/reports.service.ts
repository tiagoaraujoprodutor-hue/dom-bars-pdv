import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CashService } from '../cash/cash.service';
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
            ['Vendas', fmt(summary.salesTotal)],
            ['Suprimentos', fmt(summary.suprimentos)],
            ['Sangrias', `-${fmt(summary.sangrias)}`],
            ['Fechamento informado', fmt(summary.closingAmount)],
          ],
          total: ['Esperado em gaveta', fmt(summary.expectedInDrawer)],
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, cpf: true },
    });
    if (!user) throw new NotFoundException('Atendente não encontrado');

    const [agg] = await this.prisma.$queryRaw<{ vendas: bigint; total: Prisma.Decimal }[]>`
      SELECT COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS total FROM "Sale"
      WHERE "eventId" = ${eventId} AND status = 'CONCLUIDA' AND "operatorId" = ${userId}`;

    const pays = await this.prisma.$queryRaw<{ method: string; total: Prisma.Decimal }[]>`
      SELECT p.method AS method, COALESCE(SUM(p.amount), 0) AS total FROM "Payment" p
      JOIN "Sale" s ON s.id = p."saleId"
      WHERE s."eventId" = ${eventId} AND s.status = 'CONCLUIDA' AND s."operatorId" = ${userId}
      GROUP BY p.method`;

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
      ],
    };
  }

  /** Relatório geral — consolidação do evento (usado no fechamento). */
  async general(eventId: string): Promise<ReportSpec> {
    const [name, snap, perdas] = await Promise.all([
      this.eventName(eventId),
      this.dashboard.snapshot(eventId),
      this.prisma.lossRecord.count({ where: { eventId } }),
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
