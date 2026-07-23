/**
 * Motor de sincronização offline-first (PLAN §6.13). A regra de ouro:
 * uma venda registrada offline nunca pode ser PERDIDA nem DUPLICADA ao sincronizar.
 *
 * Como garantimos isso:
 *  - PERDA: toda operação vai para um "outbox" durável (SQLite no device) antes de
 *    qualquer rede; só sai do estado `pending` quando o servidor confirma.
 *  - DUPLICAÇÃO: cada item carrega um `id` (clientId/UUID gerado no terminal) que é a
 *    chave de idempotência. O enqueue deduplica localmente e o servidor faz upsert por
 *    `clientId` (ver API ADR-04). Reenviar o mesmo item é seguro.
 */

export type OutboxStatus = 'pending' | 'synced' | 'error';

export interface OutboxItem<T = unknown> {
  /** clientId — chave de idempotência ponta-a-ponta. */
  id: string;
  type: string;
  payload: T;
  createdAt: string;
  attempts: number;
  status: OutboxStatus;
  lastError?: string;
}

export interface OutboxStore {
  enqueue(item: OutboxItem): Promise<void>;
  /**
   * Itens a (re)enviar automaticamente: SOMENTE `status = 'pending'`. Itens em
   * `error` (falha NÃO-retentável, ex.: validação 4xx) NÃO entram aqui — reenviá-los
   * a cada flush só gastaria rede e manteria o badge "fila" travado sem nunca zerar.
   * Eles continuam salvos (auditáveis) e são exibidos à parte para atenção manual.
   */
  pending(): Promise<OutboxItem[]>;
  markSynced(id: string): Promise<void>;
  markError(id: string, error: string, retryable: boolean): Promise<void>;
  get(id: string): Promise<OutboxItem | undefined>;
  all(): Promise<OutboxItem[]>;
}

export interface SendResult {
  ok: boolean;
  /** Se a falha é transitória (rede/5xx) o item continua pending; se não, vira `error`. */
  retryable: boolean;
  error?: string;
}

export interface SyncSender {
  send(item: OutboxItem): Promise<SendResult>;
}

export interface FlushResult {
  synced: number;
  failed: number;
  remainingPending: number;
}
