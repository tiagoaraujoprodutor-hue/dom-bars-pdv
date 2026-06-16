import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { dec } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateEventConfigDto } from './event-config.dto';

const publicSelect = {
  id: true,
  companyId: true,
  name: true,
  status: true,
  serviceFeeEnabled: true,
  serviceFeePercent: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
};

@Injectable()
export class EventConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: publicSelect,
    });
    if (!event) throw new NotFoundException('Evento não encontrado');
    return event;
  }

  async update(eventId: string, userId: string, companyId: string, dto: UpdateEventConfigDto) {
    await this.get(eventId);
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        name: dto.name,
        serviceFeeEnabled: dto.serviceFeeEnabled,
        serviceFeePercent:
          dto.serviceFeePercent !== undefined ? dec(dto.serviceFeePercent) : undefined,
      },
      select: publicSelect,
    });

    await this.audit.record({
      action: 'EVENT_CONFIG_UPDATE',
      userId,
      companyId,
      eventId,
      entity: 'Event',
      entityId: eventId,
      metadata: { ...dto },
    });

    return updated;
  }
}
