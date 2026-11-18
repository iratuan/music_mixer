/**
 * Interface única de banco do Academy. As regras de trilhas, exercícios e gamificação (data/services.ts)
 * só conhecem esta interface; cada plataforma fornece a sua implementação:
 *  - web e desktop: sql.js (WebAssembly) com o arquivo persistido pelo shell (IndexedDB no navegador);
 *  - Android: plugin SQLite nativo (Etapa E7).
 * É assíncrona de propósito: drivers nativos de celular são assíncronos.
 */
export type Row = Record<string, unknown>;

export interface DatabaseAdapter {
  /** Um comando com parâmetros posicionais (?). */
  run(sql: string, params?: readonly unknown[]): Promise<void>;
  /** Consulta: uma linha por objeto, colunas pelo nome. */
  query<T extends Row = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** Vários comandos sem parâmetros (migrações). */
  script(sql: string): Promise<void>;
  /** Tudo ou nada; persiste ao confirmar. Não aninhar. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /** Arquivo SQLite inteiro (backup e migração de dados). */
  exportBytes(): Promise<Uint8Array>;
  close(): Promise<void>;
}
