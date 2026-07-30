import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dec, DecimalInput } from '../../common/money';
import { PrismaService } from '../../prisma/prisma.service';
import { PagBankClient } from './pagbank.client';

/**
 * Cobrança PIX online do PagBank — fluxo de DUAS FASES (assíncrono):
 *  Fase 1 (createCharge): cria a cobrança e devolve o QR para o terminal exibir.
 *  Fase 2 (confirmFromOrder): chamada pelo webhook (e pelo poll de status) — RE-BUSCA
 *  o pedido no PagBank (fonte da verdade) e marca o Payment APROVADO/RECUSADO.
 *
 * Regra de ouro: a venda (finalize) só é fechada DEPOIS que o Payment vira APROVADO.
 */
@Injectable()
export class PixChargeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagbank: PagBankClient,
    private readonly cfg: ConfigService,
  ) {}

  /** FASE 1 — cria a cobrança PIX e devolve o QR (texto copia-e-cola + imagem). */
  async createCharge(input: { eventId: string; amount: DecimalInput; clientId: string }) {
    const webhookToken = this.cfg.get<string>('PAGBANK_WEBHOOK_TOKEN');
    const notifyBase = this.cfg.get<string>('PAGBANK_NOTIFICATION_URL');
    if (!notifyBase) {
      throw new ServiceUnavailableException('PagBank sem URL de notificação configurada');
    }
    const seconds = this.cfg.get<number>('PAGBANK_PIX_EXPIRATION_SECONDS') ?? 1800;
    const amountCents = Number(dec(input.amount).times(100).toFixed(0));
    if (amountCents <= 0) throw new BadRequestException('Valor inválido para cobrança PIX');
    const expirationIso = new Date(Date.now() + seconds * 1000).toISOString();

    const order = await this.pagbank.createPixOrder({
      referenceId: input.clientId, // idempotente por venda
      amountCents,
      expirationIso,
      notificationUrl: `${notifyBase}/payments/pagbank/webhook?t=${webhookToken}`,
    });
    const qr = order.qr_codes?.[0];
    if (!qr) throw new BadRequestException('PagBank não retornou QR');

    // Dedup local: a idempotência do PagBank garante o MESMO order.id para o mesmo
    // clientId; se já registramos essa cobrança, devolve a existente (não duplica).
    const existing = await this.prisma.payment.findFirst({ where: { providerRef: order.id } });
    if (existing) {
      return { paymentId: existing.id, qrText: existing.qrText, qrImageUrl: existing.qrImageUrl };
    }

    const payment = await this.prisma.payment.create({
      data: {
        method: 'PIX',
        amount: dec(input.amount).toFixed(2),
        status: 'PENDENTE',
        provider: 'pagbank',
        providerRef: order.id,
        qrText: qr.text,
        qrImageUrl: qr.links.find((l) => l.rel === 'QRCODE.PNG')?.href ?? null,
        eventId: input.eventId,
      },
    });
    return { paymentId: payment.id, qrText: payment.qrText, qrImageUrl: payment.qrImageUrl };
  }

  /** FASE 2 — re-busca o pedido no PagBank e atualiza o status do Payment. */
  async confirmFromOrder(orderId: string): Promise<{ paid: boolean }> {
    const order = await this.pagbank.getOrder(orderId);
    const charges = order.charges ?? [];
    const paid = charges.some((c) => c.status === 'PAID');
    const failed = charges.some((c) => c.status === 'DECLINED' || c.status === 'CANCELED');

    // Só sai de PENDENTE quando há um desfecho: pago → APROVADO, recusado → RECUSADO.
    // Enquanto o cliente não pagou, permanece PENDENTE (webhook/poll tentam de novo).
    if (paid || failed) {
      await this.prisma.payment.updateMany({
        where: { providerRef: orderId, status: 'PENDENTE' },
        data: { status: paid ? 'APROVADO' : 'RECUSADO' },
      });
    }
    return { paid };
  }

  /** Poll de status (fallback do webhook). Se ainda PENDENTE, re-confere no PagBank. */
  async status(eventId: string, paymentId: string): Promise<{ status: string }> {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, eventId } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado');
    if (payment.status === 'PENDENTE' && payment.providerRef) {
      await this.confirmFromOrder(payment.providerRef);
      const fresh = await this.prisma.payment.findUnique({ where: { id: paymentId } });
      return { status: fresh?.status ?? payment.status };
    }
    return { status: payment.status };
  }
}
