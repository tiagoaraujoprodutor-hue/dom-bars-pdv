import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LossesController } from './losses.controller';
import { LossesService } from './losses.service';

@Module({
  imports: [AuthModule],
  controllers: [LossesController],
  providers: [LossesService],
})
export class LossesModule {}
