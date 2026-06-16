import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  action: string;
  userId?: string | null;
  companyId?: string | null;
  eventId?: string | null;
  machineId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  amount?: number | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Escritor único da trilha de auditoria. Append-only: este serviço só cria
 * registros. UPDATE/DELETE são bloqueados por trigger no banco (ver PLAN ADR-02).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        companyId: input.companyId ?? null,
        eventId: input.eventId ?? null,
        machineId: input.machineId ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        amount: input.amount ?? null,
        metadata: input.metadata,
      },
    });
  }
}
