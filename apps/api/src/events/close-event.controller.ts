import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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
import { CloseEventDto, closeEventSchema } from './close-event.dto';
import { CloseEventService } from './close-event.service';

@ApiTags('Evento')
@ApiBearerAuth()
@Controller('events/:eventId/close')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class CloseEventController {
  constructor(private readonly service: CloseEventService) {}

  @Post()
  @Roles(Role.ADMINISTRADOR)
  close(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(closeEventSchema)) dto: CloseEventDto,
  ) {
    return this.service.close(scope.eventId, user.userId, user.companyId, dto);
  }
}
