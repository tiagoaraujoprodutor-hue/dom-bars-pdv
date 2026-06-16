import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
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
import { UpdateEventConfigDto, updateEventConfigSchema } from './event-config.dto';
import { EventConfigService } from './event-config.service';

@ApiTags('Evento')
@ApiBearerAuth()
@Controller('events/:eventId/config')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class EventConfigController {
  constructor(private readonly config: EventConfigService) {}

  @Get()
  get(@EventScopeParam() scope: EventScope) {
    return this.config.get(scope.eventId);
  }

  @Patch()
  @Roles(Role.ADMINISTRADOR)
  update(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateEventConfigSchema)) dto: UpdateEventConfigDto,
  ) {
    return this.config.update(scope.eventId, user.userId, user.companyId, dto);
  }
}
