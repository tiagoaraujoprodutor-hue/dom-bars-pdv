import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, EventScope } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EventScopeParam } from '../auth/decorators/event-role.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { EventScopeGuard } from '../auth/guards/event-scope.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateLossDto, createLossSchema } from './losses.dto';
import { LossesService } from './losses.service';

@ApiTags('Perdas')
@ApiBearerAuth()
@Controller('events/:eventId/losses')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class LossesController {
  constructor(private readonly losses: LossesService) {}

  @Get()
  @Roles(Role.SUPERVISOR, Role.ADMINISTRADOR)
  list(@EventScopeParam() scope: EventScope) {
    return this.losses.list(scope.eventId);
  }

  @Post()
  @Roles(Role.ADMINISTRADOR)
  register(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createLossSchema)) dto: CreateLossDto,
  ) {
    return this.losses.register(scope.eventId, user.userId, user.companyId, dto);
  }
}
