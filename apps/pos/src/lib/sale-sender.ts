import type { OutboxItem, SendResult, SyncSender } from '@dom-bars/shared';
import { API_URL, getToken, tryRefresh } from './api';

/**
 * Envia itens do outbox para a API. Decide se a falha é retentável:
 *  - rede/timeout/5xx → retentável (continua pendente para o próximo flush);
 *  - 4xx (validação) → não retentável (vira `error`, exige atenção do operador).
 * O endpoint de venda é idempotente por clientId, então reenviar é seguro.
 */
export function createSaleSender(eventId: string): SyncSender {
  const post = (token: string | null, payload: unknown): Promise<Response> =>
    fetch(`${API_URL}/events/${eventId}/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

  return {
    async send(item: OutboxItem): Promise<SendResult> {
      try {
        let res = await post(await getToken(), item.payload);

        // Token expirado (401): renova e reenvia. Se não der, mantém RETENTÁVEL
        // — a venda NUNCA vira erro/some por causa de sessão (regra de ouro).
        if (res.status === 401) {
          const renewed = await tryRefresh();
          if (renewed) res = await post(renewed, item.payload);
          if (res.status === 401) {
            return { ok: false, retryable: true, error: 'Sessão expirada — reenvia depois' };
          }
        }

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
