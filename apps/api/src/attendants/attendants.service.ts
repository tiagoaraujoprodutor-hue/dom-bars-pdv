import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password.util';
import { normalizeCpf } from '../common/cpf';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendantDto, UpdateAttendantDto } from './attendants.dto';

function statusOf(m: { active: boolean; expiresAt: Date | null }): string {
  if (!m.active) return 'DESATIVADO';
  if (m.expiresAt && m.expiresAt.getTime() < Date.now()) return 'EXPIRADO';
  return 'ATIVO';
}

@Injectable()
export class AttendantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(eventId: string) {
    const memberships = await this.prisma.eventMembership.findMany({
      where: { eventId, passwordHash: { not: null } },
      select: {
        role: true,
        active: true,
        expiresAt: true,
        createdAt: true,
        user: { select: { id: true, name: true, cpf: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      cpf: m.user.cpf,
      role: m.role,
      active: m.active,
      expiresAt: m.expiresAt,
      status: statusOf(m),
    }));
  }

  async create(eventId: string, companyId: string, actingUserId: string, dto: CreateAttendantDto) {
    const cpf = normalizeCpf(dto.cpf);
    const passwordHash = await hashPassword(dto.password);

    const existing = await this.prisma.user.findUnique({ where: { cpf } });
    if (existing && existing.companyId !== companyId) {
      throw new ConflictException('CPF já cadastrado em outra empresa');
    }

    const user =
      existing ??
      (await this.prisma.user.create({ data: { companyId, name: dto.name, cpf } }));

    const already = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: user.id, eventId } },
    });
    if (already) {
      throw new ConflictException('Atendente já vinculado a este evento');
    }

    await this.prisma.eventMembership.create({
      data: {
        userId: user.id,
        eventId,
        role: dto.role,
        passwordHash,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        active: true,
      },
    });

    await this.audit.record({
      action: 'ATTENDANT_CREATE',
      userId: actingUserId,
      companyId,
      eventId,
      entity: 'User',
      entityId: user.id,
      metadata: { cpf, role: dto.role, expiresAt: dto.expiresAt ?? null },
    });

    return { userId: user.id, name: dto.name, cpf, role: dto.role, status: 'ATIVO' };
  }

  async update(
    eventId: string,
    userId: string,
    companyId: string,
    actingUserId: string,
    dto: UpdateAttendantDto,
  ) {
    const membership = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });
    if (!membership) throw new NotFoundException('Atendente não encontrado neste evento');

    const passwordHash = dto.password ? await hashPassword(dto.password) : undefined;
    const expiresAt =
      dto.expiresAt === undefined ? undefined : dto.expiresAt ? new Date(dto.expiresAt) : null;

    const updated = await this.prisma.eventMembership.update({
      where: { userId_eventId: { userId, eventId } },
      data: {
        passwordHash,
        role: dto.role,
        active: dto.active,
        expiresAt,
      },
      select: { role: true, active: true, expiresAt: true },
    });

    await this.audit.record({
      action: 'ATTENDANT_UPDATE',
      userId: actingUserId,
      companyId,
      eventId,
      entity: 'User',
      entityId: userId,
      metadata: {
        passwordReset: Boolean(dto.password),
        role: dto.role ?? null,
        active: dto.active ?? null,
        expiresAt: dto.expiresAt === undefined ? 'inalterado' : dto.expiresAt,
      },
    });

    return { userId, role: updated.role, active: updated.active, expiresAt: updated.expiresAt, status: statusOf(updated) };
  }

  /**
   * Fechamento por atendente: vendas (total + formas de pagamento) e conciliação de
   * caixa (caixa inicial + vendas em dinheiro + suprimentos − sangrias = esperado).
   * Cada atendente tem o próprio caixa (registro cujo openedById é ele). Filtra por CPF.
   */
  async closing(eventId: string, cpfFilter?: string) {
    const [sales, payments, openings, movements] = await Promise.all([
      this.prisma.$queryRaw<{ operatorId: string; vendas: bigint; total: Prisma.Decimal }[]>`
        SELECT "operatorId", COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS total
        FROM "Sale" WHERE "eventId" = ${eventId} AND status = 'CONCLUIDA'
        GROUP BY "operatorId"`,
      this.prisma.$queryRaw<{ operatorId: string; method: string; total: Prisma.Decimal }[]>`
        SELECT s."operatorId" AS "operatorId", p.method AS method, COALESCE(SUM(p.amount), 0) AS total
        FROM "Payment" p JOIN "Sale" s ON s.id = p."saleId"
        WHERE s."eventId" = ${eventId} AND s.status = 'CONCLUIDA'
        GROUP BY s."operatorId", p.method`,
      this.prisma.$queryRaw<{ userId: string; total: Prisma.Decimal }[]>`
        SELECT "openedById" AS "userId", COALESCE(SUM("openingAmount"), 0) AS total
        FROM "CashRegister" WHERE "eventId" = ${eventId} GROUP BY "openedById"`,
      this.prisma.$queryRaw<{ userId: string; type: string; total: Prisma.Decimal }[]>`
        SELECT r."openedById" AS "userId", m.type AS type, COALESCE(SUM(m.amount), 0) AS total
        FROM "CashMovement" m JOIN "CashRegister" r ON r.id = m."cashRegisterId"
        WHERE r."eventId" = ${eventId} GROUP BY r."openedById", m.type`,
    ]);

    const num = (v: Prisma.Decimal) => Number(v);
    const openByUser = new Map(openings.map((o) => [o.userId, num(o.total)]));
    const sangriaByUser = new Map(
      movements.filter((m) => m.type === 'SANGRIA').map((m) => [m.userId, num(m.total)]),
    );
    const suprimentoByUser = new Map(
      movements.filter((m) => m.type === 'SUPRIMENTO').map((m) => [m.userId, num(m.total)]),
    );
    const salesByUser = new Map(sales.map((s) => [s.operatorId, s]));
    const dinheiroByUser = new Map<string, number>();
    for (const p of payments) {
      if (p.method === 'DINHEIRO') dinheiroByUser.set(p.operatorId, num(p.total));
    }

    const userIds = new Set<string>([
      ...sales.map((s) => s.operatorId),
      ...openings.map((o) => o.userId),
      ...movements.map((m) => m.userId),
    ]);

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true, cpf: true },
    });
    const byUser = new Map(users.map((u) => [u.id, u]));

    let result = [...userIds]
      .map((id) => {
        const s = salesByUser.get(id);
        const caixaInicial = openByUser.get(id) ?? 0;
        const suprimentos = suprimentoByUser.get(id) ?? 0;
        const sangrias = sangriaByUser.get(id) ?? 0;
        const vendasDinheiro = dinheiroByUser.get(id) ?? 0;
        return {
          userId: id,
          name: byUser.get(id)?.name ?? id,
          cpf: byUser.get(id)?.cpf ?? null,
          vendas: s ? Number(s.vendas) : 0,
          total: (s ? num(s.total) : 0).toFixed(2),
          porFormaPagamento: payments
            .filter((p) => p.operatorId === id)
            .map((p) => ({ method: p.method, total: num(p.total).toFixed(2) })),
          caixaInicial: caixaInicial.toFixed(2),
          suprimentos: suprimentos.toFixed(2),
          sangrias: sangrias.toFixed(2),
          vendasDinheiro: vendasDinheiro.toFixed(2),
          caixaEsperado: (caixaInicial + vendasDinheiro + suprimentos - sangrias).toFixed(2),
        };
      })
      .sort((a, b) => Number(b.total) - Number(a.total));

    if (cpfFilter) {
      const cpf = normalizeCpf(cpfFilter);
      result = result.filter((r) => r.cpf === cpf);
    }
    return result;
  }
}
