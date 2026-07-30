import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ManualPaymentProvider } from './manual-payment.provider';
import { PagBankClient } from './pagbank/pagbank.client';
import { PagBankWebhookController } from './pagbank/pagbank-webhook.controller';
import { PixChargeService } from './pagbank/pix-charge.service';
import { PixController } from './pagbank/pix.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule], // guards (EventScopeGuard/RolesGuard) usados pelo PixController
  controllers: [PixController, PagBankWebhookController],
  providers: [ManualPaymentProvider, PaymentsService, PagBankClient, PixChargeService],
  exports: [PaymentsService, PixChargeService],
})
export class PaymentsModule {}
