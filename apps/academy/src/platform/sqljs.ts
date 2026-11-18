import type { DatabaseAdapter, Row } from './database.js';

/** Subconjunto da API do sql.js que usamos (o pacote não traz tipos). */
interface SqlJsStatement {
  bind(values: unknown[]): boolean;
  step(): boolean;
  getAsObject(): Row;
  free(): boolean;
}
export interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): unknown;
  exec(sql: string): unknown;
  prepare(sql: string): SqlJsStatement;
  export(): Uint8Array;
  close(): void;
}
export interface SqlJsStatic {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
}

/**
 * Adapter sobre sql.js: o banco vive em memória e o arquivo inteiro é entregue a `persist` a cada
 * transação confirmada (o shell decide onde gravar: IndexedDB, arquivo do desktop…).
 */
export function sqlJsAdapter(SQL: SqlJsStatic, initial: Uint8Array | null, persist: (bytes: Uint8Array) => Promise<void>): DatabaseAdapter {
  const db = new SQL.Database(initial ?? undefined);
  let inTx = false;

  const adapter: DatabaseAdapter = {
    async run(sql, params = []) {
      db.run(sql, [...params]);
    },
    async query<T extends Row = Row>(sql: string, params: readonly unknown[] = []) {
      const st = db.prepare(sql);
      try {
        st.bind([...params]);
        const out: T[] = [];
        while (st.step()) out.push(st.getAsObject() as T);
        return out;
      } finally {
        st.free();
      }
    },
    async script(sql) {
      db.exec(sql);
    },
    async transaction<T>(fn: () => Promise<T>) {
      if (inTx) throw new Error('transação aninhada');
      inTx = true;
      db.exec('BEGIN');
      try {
        const result = await fn();
        db.exec('COMMIT');
        inTx = false;
        await persist(db.export());
        return result;
      } catch (e) {
        if (inTx) {
          db.exec('ROLLBACK');
          inTx = false;
        }
        throw e;
      }
    },
    async exportBytes() {
      return db.export();
    },
    async close() {
      db.close();
    },
  };
  return adapter;
}
