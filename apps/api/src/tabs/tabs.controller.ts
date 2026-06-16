import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, EventScope } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EventScopeParam } from '../auth/decorators/event-role.decorator';
import { EventScopeGuard } from '../auth/guards/event-scope.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  AddTabItemsDto,
  CloseTabDto,
  CreateTabDto,
  addTabItemsSchema,
  closeTabSchema,
  createTabSchema,
} from './dto/tabs.dto';
import { TabsService } from './tabs.service';

@ApiTags('Comandas')
@ApiBearerAuth()
@Controller('events/:eventId/tabs')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class TabsController {
  constructor(private readonly tabs: TabsService) {}

  @Post()
  create(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTabSchema)) dto: CreateTabDto,
  ) {
    return this.tabs.create(scope.eventId, user.userId, user.companyId, dto);
  }

  @Get(':code')
  getByCode(@EventScopeParam() scope: EventScope, @Param('code') code: string) {
    return this.tabs.getByCode(scope.eventId, code);
  }

  @Post(':id/items')
  addItems(
    @EventScopeParam() scope: EventScope,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addTabItemsSchema)) dto: AddTabItemsDto,
  ) {
    return this.tabs.addItems(scope.eventId, id, dto);
  }

  @Post(':id/close')
  close(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeTabSchema)) dto: CloseTabDto,
  ) {
    return this.tabs.close(scope.eventId, id, user, dto);
  }
}
