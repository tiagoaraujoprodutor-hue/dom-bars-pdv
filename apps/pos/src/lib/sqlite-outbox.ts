import type { OutboxItem, OutboxStore } from '@dom-bars/shared';
import * as SQLite from 'expo-sqlite';

interface Row {
  id: string;
  type: string;
  payload: string;
  createdAt: string;
  attempts: number;
  status: string;
  lastError: string | null;
}

/**
 * Outbox durável em SQLite (expo-sqlite). É a garantia de "não perder venda":
 * a operação é persistida ANTES de qualquer rede e só muda para `synced` quando
 * o servidor confirma. Implementa o contrato OutboxStore de @dom-bars/shared.
 */
export class SqliteOutboxStore implements OutboxStore {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync('pdv-outbox.db');
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        lastError TEXT
      );
    `);
  }

  private get database(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('Outbox não inicializado');
    return this.db;
  }

  async enqueue(item: OutboxItem): Promise<void> {
    // INSERT OR IGNORE garante a dedup local por id (idempotência).
    await this.database.runAsync(
      `INSERT OR IGNORE INTO outbox (id, type, payload, createdAt, attempts, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      item.id,
      item.type,
      JSON.stringify(item.payload),
      item.createdAt,
      item.attempts,
      item.status,
    );
  }

  private toItem(row: Row): OutboxItem {
    return {
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      createdAt: row.createdAt,
      attempts: row.attempts,
      status: row.status as OutboxItem['status'],
      lastError: row.lastError ?? undefined,
    };
  }

  async pending(): Promise<OutboxItem[]> {
    const rows = await this.database.getAllAsync<Row>(
      `SELECT * FROM outbox WHERE status != 'synced' ORDER BY createdAt ASC`,
    );
    return rows.map((r) => this.toItem(r));
  }

  async markSynced(id: string): Promise<void> {
    await this.database.runAsync(`UPDATE outbox SET status = 'synced' WHERE id = ?`, id);
  }

  async markError(id: string, error: string, retryable: boolean): Promise<void> {
    await this.database.runAsync(
      `UPDATE outbox SET attempts = attempts + 1, lastError = ?, status = ? WHERE id = ?`,
      error,
      retryable ? 'pending' : 'error',
      id,
    );
  }

  async get(id: string): Promise<OutboxItem | undefined> {
    const row = await this.database.getFirstAsync<Row>(`SELECT * FROM outbox WHERE id = ?`, id);
    return row ? this.toItem(row) : undefined;
  }

  async all(): Promise<OutboxItem[]> {
    const rows = await this.database.getAllAsync<Row>(`SELECT * FROM outbox ORDER BY createdAt ASC`);
    return rows.map((r) => this.toItem(r));
  }
}
