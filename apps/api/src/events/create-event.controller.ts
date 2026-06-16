import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto, createEventSchema } from './create-event.dto';
import { CreateEventService } from './create-event.service';

@ApiTags('Evento')
@ApiBearerAuth()
@Controller('events')
@UseGuards(JwtAuthGuard)
export class CreateEventController {
  constructor(
    private readonly service: CreateEventService,
    private readonly prisma: PrismaService,
  ) {}

  /** Eventos da empresa do usuário em que ele participa. */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const memberships = await this.prisma.eventMembership.findMany({
      where: { userId: user.userId, event: { companyId: user.companyId } },
      select: {
        role: true,
        event: { select: { id: true, name: true, status: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return memberships.map((m) => ({ ...m.event, role: m.role }));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEventSchema)) dto: CreateEventDto,
  ) {
    return this.service.create(user.companyId, user.userId, dto);
  }
}
