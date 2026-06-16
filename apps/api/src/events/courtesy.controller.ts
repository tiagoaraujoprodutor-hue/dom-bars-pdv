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
import { CreateCourtesyDto, createCourtesySchema } from './courtesy.dto';
import { CourtesyService } from './courtesy.service';

@ApiTags('Cortesias')
@ApiBearerAuth()
@Controller('events/:eventId/courtesies')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class CourtesyController {
  constructor(private readonly courtesy: CourtesyService) {}

  @Get()
  @Roles(Role.SUPERVISOR, Role.ADMINISTRADOR)
  list(@EventScopeParam() scope: EventScope) {
    return this.courtesy.list(scope.eventId);
  }

  @Post()
  @Roles(Role.ADMINISTRADOR)
  create(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCourtesySchema)) dto: CreateCourtesyDto,
  ) {
    return this.courtesy.create(scope.eventId, user.userId, user.companyId, dto);
  }
}
