import type { OutboxItem, SendResult, SyncSender } from '@dom-bars/shared';
import { API_URL, getToken } from './api';

/**
 * Envia itens do outbox para a API. Decide se a falha é retentável:
 *  - rede/timeout/5xx → retentável (continua pendente para o próximo flush);
 *  - 4xx (validação) → não retentável (vira `error`, exige atenção do operador).
 * O endpoint de venda é idempotente por clientId, então reenviar é seguro.
 */
export function createSaleSender(eventId: string): SyncSender {
  return {
    async send(item: OutboxItem): Promise<SendResult> {
      const token = await getToken();
      try {
        const res = await fetch(`${API_URL}/events/${eventId}/sales`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(item.payload),
        });

        if (res.ok) return { ok: true, retryable: false };

        if (res.status >= 500 || res.status === 429) {
          return { ok: false, retryable: true, error: `HTTP ${res.status}` };
        }
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        return { ok: false, retryable: false, error: data.message ?? `HTTP ${res.status}` };
      } catch (err) {
        // Sem rede → retentável.
        return { ok: false, retryable: true, error: (err as Error).message };
      }
    },
  };
}
