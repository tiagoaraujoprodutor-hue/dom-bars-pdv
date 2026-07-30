import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Retorno mínimo da Orders API que consumimos. */
export interface PagBankOrder {
  id: string;
  reference_id: string;
  qr_codes?: { id: string; text: string; links: { rel: string; href: string; media: string }[] }[];
  charges?: { id: string; status: string; amount: { value: number } }[];
}

/**
 * Cliente HTTP da Orders API do PagBank. Toda chamada usa Bearer token e tem
 * timeout (a maquininha/terminal não pode ficar pendurada numa requisição).
 */
@Injectable()
export class PagBankClient {
  private readonly log = new Logger('PagBankClient');
  private readonly base: string;
  private readonly token?: string;

  constructor(private readonly cfg: ConfigService) {
    this.base = this.cfg.get<string>('PAGBANK_BASE_URL') ?? 'https://sandbox.api.pagseguro.com';
    this.token = this.cfg.get<string>('PAGBANK_TOKEN');
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    if (!this.token) throw new HttpException('PagBank sem token configurado', 503);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // Idempotência ESTÁVEL: reenvio da MESMA cobrança (mesma chave) não duplica
          // o pedido no PagBank — a chave vem do clientId da venda, não é aleatória.
          ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      const json: unknown = text ? JSON.parse(text) : {};
      if (!res.ok) {
        this.log.error(`PagBank ${method} ${path} -> ${res.status} ${text}`);
        const msg = (json as { error_messages?: unknown }).error_messages;
        throw new HttpException((msg as object) ?? 'Erro PagBank', res.status);
      }
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cria um pedido com QR Code PIX. Idempotente por referenceId (= clientId da venda). */
  createPixOrder(input: {
    referenceId: string;
    amountCents: number;
    expirationIso: string;
    notificationUrl: string;
  }): Promise<PagBankOrder> {
    return this.call<PagBankOrder>(
      'POST',
      '/orders',
      {
        reference_id: input.referenceId,
        items: [
          { name: `Pedido ${input.referenceId}`, quantity: 1, unit_amount: input.amountCents },
        ],
        qr_codes: [{ amount: { value: input.amountCents }, expiration_date: input.expirationIso }],
        notification_urls: [input.notificationUrl],
      },
      input.referenceId,
    );
  }

  getOrder(orderId: string): Promise<PagBankOrder> {
    return this.call<PagBankOrder>('GET', `/orders/${orderId}`);
  }
}
