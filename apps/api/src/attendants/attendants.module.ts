import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttendantsController } from './attendants.controller';
import { AttendantsService } from './attendants.service';

@Module({
  imports: [AuthModule],
  controllers: [AttendantsController],
  providers: [AttendantsService],
})
export class AttendantsModule {}
