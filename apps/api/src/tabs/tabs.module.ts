import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SalesModule } from '../sales/sales.module';
import { TabsController } from './tabs.controller';
import { TabsService } from './tabs.service';

@Module({
  imports: [AuthModule, SalesModule],
  controllers: [TabsController],
  providers: [TabsService],
})
export class TabsModule {}
