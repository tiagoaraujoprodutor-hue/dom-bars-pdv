import { ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password.util';
import { dec } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './create-event.dto';

/**
 * Backend do wizard de criação de evento (PLAN §4). Cria o evento na empresa do
 * usuário, torna o criador ADMINISTRADOR e popula produtos/usuários iniciais —
 * tudo em uma transação. Auditado.
 */
@Injectable()
export class CreateEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(companyId: string, creatorId: string, dto: CreateEventDto) {
    if (dto.users?.length) {
      const emails = dto.users.map((u) => u.email);
      const clash = await this.prisma.user.findFirst({ where: { email: { in: emails } } });
      if (clash) {
        throw new ConflictException(`E-mail já cadastrado: ${clash.email}`);
      }
    }

    const adminPasswordHash = await hashPassword(dto.adminPassword);
    const extraUsers = await Promise.all(
      (dto.users ?? []).map(async (u) => ({ ...u, passwordHash: await hashPassword(u.password) })),
    );

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          companyId,
          name: dto.name,
          adminPasswordHash,
          serviceFeeEnabled: dto.serviceFeeEnabled,
          serviceFeePercent: dec(dto.serviceFeePercent),
          memberships: { create: { userId: creatorId, role: Role.ADMINISTRADOR } },
        },
      });

      if (dto.products?.length) {
        await tx.product.createMany({
          data: dto.products.map((p) => ({
            eventId: created.id,
            name: p.name,
            price: dec(p.price),
            stock: p.stock,
            minStock: p.minStock,
          })),
        });
      }

      for (const u of extraUsers) {
        await tx.user.create({
          data: {
            companyId,
            name: u.name,
            email: u.email,
            passwordHash: u.passwordHash,
            memberships: { create: { eventId: created.id, role: u.role } },
          },
        });
      }

      return created;
    });

    await this.audit.record({
      action: 'EVENT_CREATE',
      userId: creatorId,
      companyId,
      eventId: event.id,
      entity: 'Event',
      entityId: event.id,
      metadata: { name: dto.name, products: dto.products?.length ?? 0, users: dto.users?.length ?? 0 },
    });

    return {
      id: event.id,
      name: event.name,
      serviceFeeEnabled: event.serviceFeeEnabled,
      serviceFeePercent: event.serviceFeePercent,
      status: event.status,
    };
  }
}
