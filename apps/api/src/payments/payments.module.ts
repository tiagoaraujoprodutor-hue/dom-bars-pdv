import { Module } from '@nestjs/common';
import { ManualPaymentProvider } from './manual-payment.provider';
import { PaymentsService } from './payments.service';

@Module({
  providers: [ManualPaymentProvider, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
