import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CourtesyController } from './courtesy.controller';
import { CourtesyService } from './courtesy.service';
import { CreateEventController } from './create-event.controller';
import { CreateEventService } from './create-event.service';
import { EventConfigController } from './event-config.controller';
import { EventConfigService } from './event-config.service';
import { EventsController } from './events.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    EventsController,
    EventConfigController,
    CourtesyController,
    CreateEventController,
  ],
  providers: [EventConfigService, CourtesyService, CreateEventService],
})
export class EventsModule {}
