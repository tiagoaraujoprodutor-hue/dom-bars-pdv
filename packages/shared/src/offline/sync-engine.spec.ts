import { InMemoryOutboxStore } from './memory-store';
import { SyncEngine } from './sync-engine';
import { OutboxItem, SendResult, SyncSender } from './types';

/** Servidor falso idempotente: deduplica por id, como a API real (clientId). */
class FakeServer {
  public readonly received = new Map<string, number>();
  online = true;
  rejectNonRetryable = false;

  asSender(): SyncSender {
    return {
      send: (item: OutboxItem): Promise<SendResult> => {
        if (!this.online) {
          return Promise.resolve({ ok: false, retryable: true, error: 'offline' });
        }
        if (this.rejectNonRetryable) {
          return Promise.resolve({ ok: false, retryable: false, error: 'invalido' });
        }
        this.received.set(item.id, (this.received.get(item.id) ?? 0) + 1);
        return Promise.resolve({ ok: true, retryable: false });
      },
    };
  }

  /** Quantas vendas DISTINTAS o servidor efetivou (idempotência). */
  distinct(): number {
    return this.received.size;
  }
}

describe('SyncEngine — regra de ouro offline (zero perda / zero duplicação)', () => {
  it('não perde: item enfileirado offline permanece pendente até confirmar', async () => {
    const store = new InMemoryOutboxStore();
    const server = new FakeServer();
    server.online = false;
    const engine = new SyncEngine(store, server.asSender());

    await engine.enqueue('sale', { total: '10.00' }, 'venda-1');
    expect(await engine.pendingCount()).toBe(1);

    const offlineFlush = await engine.flush();
    expect(offlineFlush.synced).toBe(0);
    expect(await engine.pendingCount()).toBe(1); // continua pendente, não some

    server.online = true;
    const onlineFlush = await engine.flush();
    expect(onlineFlush.synced).toBe(1);
    expect(await engine.pendingCount()).toBe(0);
  });

  it('não duplica: reenviar a mesma venda não cria duplicata (idempotência)', async () => {
    const store = new InMemoryOutboxStore();
    const server = new FakeServer();
    const engine = new SyncEngine(store, server.asSender());

    // Mesmo clientId enfileirado duas vezes (ex.: usuário tocou 2x / retry de UI).
    await engine.enqueue('sale', { total: '10.00' }, 'venda-x');
    await engine.enqueue('sale', { total: '10.00' }, 'venda-x');
    expect((await store.all()).length).toBe(1);

    // Dois flushes (ex.: crash após enviar, antes de marcar synced).
    await engine.flush();
    await engine.flush();

    expect(server.distinct()).toBe(1);
    expect(await engine.pendingCount()).toBe(0);
  });

  it('reenvia falhas transitórias e mantém ordem de criação', async () => {
    const store = new InMemoryOutboxStore();
    const server = new FakeServer();
    server.online = false;
    const engine = new SyncEngine(store, server.asSender());

    await engine.enqueue('sale', { n: 1 }, 'a');
    await engine.enqueue('sale', { n: 2 }, 'b');
    await engine.flush(); // tudo falha (offline)
    expect(await engine.pendingCount()).toBe(2);

    server.online = true;
    const res = await engine.flush();
    expect(res.synced).toBe(2);
    expect(server.distinct()).toBe(2);
  });

  it('marca erro não-retentável sem perder o registro (auditável)', async () => {
    const store = new InMemoryOutboxStore();
    const server = new FakeServer();
    server.rejectNonRetryable = true;
    const engine = new SyncEngine(store, server.asSender());

    await engine.enqueue('sale', { total: '10.00' }, 'ruim');
    await engine.flush();

    const item = await store.get('ruim');
    expect(item?.status).toBe('error');
    expect(item?.attempts).toBe(1);
    // ainda existe no outbox (não foi descartado)
    expect((await store.all()).length).toBe(1);
  });
});
