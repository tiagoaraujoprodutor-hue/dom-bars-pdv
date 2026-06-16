import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CourtesyController } from './courtesy.controller';
import { CourtesyService } from './courtesy.service';
import { EventConfigController } from './event-config.controller';
import { EventConfigService } from './event-config.service';
import { EventsController } from './events.controller';

@Module({
  imports: [AuthModule],
  controllers: [EventsController, EventConfigController, CourtesyController],
  providers: [EventConfigService, CourtesyService],
})
export class EventsModule {}
