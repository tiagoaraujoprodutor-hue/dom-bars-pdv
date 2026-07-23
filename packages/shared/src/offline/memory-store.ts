import { OutboxItem, OutboxStore } from './types';

/**
 * Implementação em memória do outbox — usada em testes e como referência da
 * semântica esperada da implementação durável (SQLite) no app POS.
 */
export class InMemoryOutboxStore implements OutboxStore {
  private readonly items = new Map<string, OutboxItem>();

  enqueue(item: OutboxItem): Promise<void> {
    // Dedup por id (idempotência local): não cria duplicata se já existe.
    if (!this.items.has(item.id)) {
      this.items.set(item.id, { ...item });
    }
    return Promise.resolve();
  }

  pending(): Promise<OutboxItem[]> {
    const list = [...this.items.values()]
      .filter((i) => i.status === 'pending')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return Promise.resolve(list);
  }

  markSynced(id: string): Promise<void> {
    const item = this.items.get(id);
    if (item) item.status = 'synced';
    return Promise.resolve();
  }

  markError(id: string, error: string, retryable: boolean): Promise<void> {
    const item = this.items.get(id);
    if (item) {
      item.attempts += 1;
      item.lastError = error;
      item.status = retryable ? 'pending' : 'error';
    }
    return Promise.resolve();
  }

  get(id: string): Promise<OutboxItem | undefined> {
    const item = this.items.get(id);
    return Promise.resolve(item ? { ...item } : undefined);
  }

  all(): Promise<OutboxItem[]> {
    return Promise.resolve([...this.items.values()].map((i) => ({ ...i })));
  }
}
