import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PaymentContext, PaymentProvider, PaymentResult } from './payment-provider.interface';

/**
 * Provedor manual: o operador confirma o recebimento no terminal (dinheiro, PIX,
 * cartão maquininha externa, cortesia). Aprovação imediata. Substituível/ampliável
 * por um provedor integrado (PagBank) sem tocar na regra de venda.
 */
@Injectable()
export class ManualPaymentProvider implements PaymentProvider {
  readonly name = 'manual';
  readonly methods: PaymentMethod[] = [
    PaymentMethod.PIX,
    PaymentMethod.CREDITO,
    PaymentMethod.DEBITO,
    PaymentMethod.DINHEIRO,
    PaymentMethod.CORTESIA,
  ];

  process(_context: PaymentContext): Promise<PaymentResult> {
    return Promise.resolve({ approved: true, providerRef: `manual-${randomUUID()}` });
  }
}
