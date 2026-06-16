import { ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(eventId: string) {
    return this.prisma.eventMembership.findMany({
      where: { eventId },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, active: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(eventId: string, companyId: string, actingUserId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        companyId,
        name: dto.name,
        email: dto.email,
        passwordHash,
        memberships: { create: { eventId, role: dto.role } },
      },
      select: { id: true, name: true, email: true },
    });

    await this.audit.record({
      action: 'USER_CREATE',
      userId: actingUserId,
      companyId,
      eventId,
      entity: 'User',
      entityId: user.id,
      metadata: { email: dto.email, role: dto.role },
    });

    return { ...user, role: dto.role };
  }
}
