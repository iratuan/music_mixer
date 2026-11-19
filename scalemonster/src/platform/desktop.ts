import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { createAcademyData } from '../data/services.js';
import type { PlatformBridge, SaveKind, SaveResult } from './bridge.js';
import { sqlJsAdapter, type SqlJsStatic } from './sqljs.js';

/**
 * Plataforma "desktop" (shell Electron em ./shells/desktop): o mesmo build web, com o banco
 * num arquivo da pasta de dados do app e o diálogo de salvar do sistema. O shell expõe
 * `window.academyDesktop` (preload); fora dele, este módulo não é usado.
 */
interface AcademyDesktopApi {
  info(): Promise<{ version: string; platform: string }>;
  dbRead(): Promise<Uint8Array | null>;
  dbWrite(bytes: Uint8Array): Promise<{ bytes: number }>;
  saveFile(name: string, bytes: Uint8Array, kind: SaveKind): Promise<SaveResult>;
  legacyStatus(): Promise<{ available: boolean }>;
  legacyImport(): Promise<{ imported: true }>;
  legacyDismiss(): Promise<{ dismissed: true }>;
}

declare global {
  interface Window {
    academyDesktop?: AcademyDesktopApi;
  }
}

/** API do shell, se estivermos dentro dele. */
export const desktopApi = (): AcademyDesktopApi | null => window.academyDesktop ?? null;

export function desktopBridge(api: AcademyDesktopApi): PlatformBridge {
  return {
    kind: 'desktop',
    saveFile: (name, bytes, kind) => api.saveFile(name, bytes, kind),
    legacy: {
      available: async () => (await api.legacyStatus()).available,
      importNow: async () => void (await api.legacyImport()),
      dismiss: async () => void (await api.legacyDismiss()),
    },
  };
}

export async function openDesktopData(api: AcademyDesktopApi) {
  const SQL = (await initSqlJs({ locateFile: () => wasmUrl })) as SqlJsStatic;
  const initial = await api.dbRead();
  return createAcademyData(sqlJsAdapter(SQL, initial, async (bytes) => void (await api.dbWrite(bytes))));
}
