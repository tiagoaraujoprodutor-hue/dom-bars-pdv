import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { ManualPaymentProvider } from './manual-payment.provider';
import { PaymentContext, PaymentProvider, PaymentResult } from './payment-provider.interface';

@Injectable()
export class PaymentsService {
  private readonly providers = new Map<PaymentMethod, PaymentProvider>();

  constructor(manual: ManualPaymentProvider) {
    this.register(manual);
  }

  /** Registra um provider para os métodos que ele declara tratar. */
  register(provider: PaymentProvider): void {
    for (const method of provider.methods) {
      this.providers.set(method, provider);
    }
  }

  process(context: PaymentContext): Promise<PaymentResult> {
    const provider = this.providers.get(context.method);
    if (!provider) {
      throw new BadRequestException(`Forma de pagamento não suportada: ${context.method}`);
    }
    return provider.process(context);
  }
}
