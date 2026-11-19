/// <reference types="vite/client" />

// O Academy não tem `window.baixaria`: tudo que depende da plataforma passa por platform/bridge.ts.

/** sql.js não traz tipos; o adapter (platform/sqljs.ts) define o subconjunto usado. */
declare module 'sql.js/dist/sql-wasm-browser.js' {
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<unknown>;
  export default initSqlJs;
}
