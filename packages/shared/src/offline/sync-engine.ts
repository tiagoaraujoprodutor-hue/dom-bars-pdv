import { FlushResult, OutboxItem, OutboxStore, SyncSender } from './types';

function uuid(): string {
  // UUID v4 simples (suficiente para clientId; no device pode-se usar crypto nativo).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Orquestra o outbox durável e o envio idempotente. Seguro para offline:
 * enfileira primeiro (sem perda), envia quando der (sem duplicação via clientId).
 */
export class SyncEngine {
  private flushing = false;

  constructor(
    private readonly store: OutboxStore,
    private readonly sender: SyncSender,
  ) {}

  /** Enfileira uma operação. Retorna o id (clientId) usado. */
  async enqueue<T>(type: string, payload: T, id: string = uuid()): Promise<string> {
    const item: OutboxItem<T> = {
      id,
      type,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending',
    };
    await this.store.enqueue(item);
    return id;
  }

  async pendingCount(): Promise<number> {
    return (await this.store.pending()).length;
  }

  /**
   * Quantos itens estão em erro TERMINAL (não-retentável) — precisam de atenção
   * manual (ex.: uma venda rejeitada por validação). Não somem: ficam auditáveis.
   */
  async erroredCount(): Promise<number> {
    return (await this.store.all()).filter((i) => i.status === 'error').length;
  }

  /** Recupera um item da fila pelo id (clientId) — para consultar status/erro. */
  getItem(id: string): Promise<OutboxItem | undefined> {
    return this.store.get(id);
  }

  /**
   * Tenta enviar todos os itens pendentes. Single-flight: chamadas concorrentes
   * não duplicam envios. Itens com falha transitória continuam pending.
   */
  async flush(): Promise<FlushResult> {
    if (this.flushing) {
      return { synced: 0, failed: 0, remainingPending: await this.pendingCount() };
    }
    this.flushing = true;
    let synced = 0;
    let failed = 0;
    try {
      const items = await this.store.pending();
      for (const item of items) {
        const result = await this.sender.send(item);
        if (result.ok) {
          await this.store.markSynced(item.id);
          synced += 1;
        } else {
          await this.store.markError(item.id, result.error ?? 'erro', result.retryable);
          failed += 1;
        }
      }
    } finally {
      this.flushing = false;
    }
    return { synced, failed, remainingPending: await this.pendingCount() };
  }
}

export { uuid };
