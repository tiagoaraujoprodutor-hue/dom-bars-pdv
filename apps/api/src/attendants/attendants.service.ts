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
   * Fechamento por atendente: quanto cada um vendeu (total + formas de pagamento),
   * para conferência no fechamento do evento. Opcionalmente filtra por CPF.
   */
  async closing(eventId: string, cpfFilter?: string) {
    const sales = await this.prisma.$queryRaw<
      { operatorId: string; vendas: bigint; total: Prisma.Decimal }[]
    >`
      SELECT "operatorId", COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS total
      FROM "Sale" WHERE "eventId" = ${eventId} AND status = 'CONCLUIDA'
      GROUP BY "operatorId"`;

    const payments = await this.prisma.$queryRaw<
      { operatorId: string; method: string; total: Prisma.Decimal }[]
    >`
      SELECT s."operatorId" AS "operatorId", p.method AS method, COALESCE(SUM(p.amount), 0) AS total
      FROM "Payment" p JOIN "Sale" s ON s.id = p."saleId"
      WHERE s."eventId" = ${eventId} AND s.status = 'CONCLUIDA'
      GROUP BY s."operatorId", p.method`;

    const users = await this.prisma.user.findMany({
      where: { id: { in: sales.map((s) => s.operatorId) } },
      select: { id: true, name: true, cpf: true },
    });
    const byUser = new Map(users.map((u) => [u.id, u]));

    let result = sales
      .map((s) => ({
        userId: s.operatorId,
        name: byUser.get(s.operatorId)?.name ?? s.operatorId,
        cpf: byUser.get(s.operatorId)?.cpf ?? null,
        vendas: Number(s.vendas),
        total: Number(s.total).toFixed(2),
        porFormaPagamento: payments
          .filter((p) => p.operatorId === s.operatorId)
          .map((p) => ({ method: p.method, total: Number(p.total).toFixed(2) })),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total));

    if (cpfFilter) {
      const cpf = normalizeCpf(cpfFilter);
      result = result.filter((r) => r.cpf === cpf);
    }
    return result;
  }
}
