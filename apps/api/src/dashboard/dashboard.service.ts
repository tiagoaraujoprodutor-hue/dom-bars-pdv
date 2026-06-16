import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function money(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(2);
}

export interface DashboardSnapshot {
  eventId: string;
  generatedAt: string;
  faturamentoBruto: string;
  totalVendas: number;
  ticketMedio: string;
  porOperador: { operatorId: string; nome: string; total: string; vendas: number }[];
  porMaquina: { machineId: string; total: string; vendas: number }[];
  porFormaPagamento: { method: string; total: string }[];
  produtosMaisVendidos: { productId: string; nome: string; quantidade: number }[];
  comandas: { abertas: number; fechadas: number };
  sangrias: string;
  cortesias: { total: string; quantidade: number };
  vendasPorMinuto: { minuto: string; total: string; vendas: number }[];
}

/**
 * Métricas em tempo real do evento (PLAN §6.10). Destaque: FATURAMENTO BRUTO TOTAL.
 * Considera apenas vendas CONCLUIDA (estornadas saem do faturamento).
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(eventId: string): Promise<DashboardSnapshot> {
    const saleWhere: Prisma.SaleWhereInput = { eventId, status: 'CONCLUIDA' };

    const [agg, porOperadorRaw, porMaquinaRaw, pagamentos, itens, comandasRaw, sangriasAgg, cortesiasAgg] =
      await Promise.all([
        this.prisma.sale.aggregate({ where: saleWhere, _sum: { total: true }, _count: true }),
        this.prisma.sale.groupBy({
          by: ['operatorId'],
          where: saleWhere,
          _sum: { total: true },
          _count: true,
        }),
        this.prisma.sale.groupBy({
          by: ['machineId'],
          where: saleWhere,
          _sum: { total: true },
          _count: true,
        }),
        this.prisma.payment.groupBy({
          by: ['method'],
          where: { sale: { is: saleWhere } },
          _sum: { amount: true },
        }),
        this.prisma.saleItem.groupBy({
          by: ['productId'],
          where: { sale: { is: saleWhere } },
          _sum: { quantity: true },
        }),
        this.prisma.tab.groupBy({ by: ['status'], where: { eventId }, _count: true }),
        this.prisma.cashMovement.aggregate({
          where: { type: 'SANGRIA', cashRegister: { is: { eventId } } },
          _sum: { amount: true },
        }),
        this.prisma.courtesy.aggregate({ where: { eventId }, _sum: { amount: true }, _count: true }),
      ]);

    const operatorIds = porOperadorRaw.map((o) => o.operatorId);
    const productIds = itens.map((i) => i.productId);
    const [operators, products] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: operatorIds } },
        select: { id: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      }),
    ]);
    const operatorName = new Map(operators.map((o) => [o.id, o.name]));
    const productName = new Map(products.map((p) => [p.id, p.name]));

    const totalVendas = agg._count;
    const faturamento = agg._sum.total ?? new Prisma.Decimal(0);
    const ticket = totalVendas > 0 ? faturamento.div(totalVendas) : new Prisma.Decimal(0);

    const vendasPorMinuto = await this.prisma.$queryRaw<
      { minuto: Date; total: Prisma.Decimal; vendas: bigint }[]
    >`
      SELECT date_trunc('minute', "createdAt") AS minuto,
             COALESCE(SUM(total), 0) AS total,
             COUNT(*) AS vendas
      FROM "Sale"
      WHERE "eventId" = ${eventId} AND status = 'CONCLUIDA'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 30`;

    return {
      eventId,
      generatedAt: new Date().toISOString(),
      faturamentoBruto: money(faturamento),
      totalVendas,
      ticketMedio: money(ticket),
      porOperador: porOperadorRaw.map((o) => ({
        operatorId: o.operatorId,
        nome: operatorName.get(o.operatorId) ?? o.operatorId,
        total: money(o._sum.total),
        vendas: o._count,
      })),
      porMaquina: porMaquinaRaw.map((m) => ({
        machineId: m.machineId ?? 'desconhecida',
        total: money(m._sum.total),
        vendas: m._count,
      })),
      porFormaPagamento: pagamentos.map((p) => ({
        method: p.method,
        total: money(p._sum.amount),
      })),
      produtosMaisVendidos: itens
        .map((i) => ({
          productId: i.productId,
          nome: productName.get(i.productId) ?? i.productId,
          quantidade: i._sum.quantity ?? 0,
        }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10),
      comandas: {
        abertas: comandasRaw.find((c) => c.status === 'ABERTA')?._count ?? 0,
        fechadas: comandasRaw.find((c) => c.status === 'FECHADA')?._count ?? 0,
      },
      sangrias: money(sangriasAgg._sum.amount),
      cortesias: { total: money(cortesiasAgg._sum.amount), quantidade: cortesiasAgg._count },
      vendasPorMinuto: vendasPorMinuto.map((v) => ({
        minuto: v.minuto.toISOString(),
        total: money(v.total),
        vendas: Number(v.vendas),
      })),
    };
  }
}
