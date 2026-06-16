import { Injectable } from '@nestjs/common';
import { AdminPasswordService } from '../auth/admin-password.service';
import { AuditService } from '../audit/audit.service';
import { dec } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourtesyDto } from './courtesy.dto';

@Injectable()
export class CourtesyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly adminPassword: AdminPasswordService,
  ) {}

  list(eventId: string) {
    return this.prisma.courtesy.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' } });
  }

  async create(eventId: string, userId: string, companyId: string, dto: CreateCourtesyDto) {
    await this.adminPassword.assertValid(eventId, dto.adminPassword);

    const courtesy = await this.prisma.courtesy.create({
      data: {
        eventId,
        beneficiary: dto.beneficiary,
        reason: dto.reason,
        amount: dec(dto.amount),
        saleId: dto.saleId,
        responsibleId: userId,
      },
    });

    await this.audit.record({
      action: 'COURTESY_GRANT',
      userId,
      companyId,
      eventId,
      entity: 'Courtesy',
      entityId: courtesy.id,
      amount: courtesy.amount.toNumber(),
      metadata: { beneficiary: dto.beneficiary, reason: dto.reason },
    });

    return courtesy;
  }
}
