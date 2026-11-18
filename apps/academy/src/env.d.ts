/// <reference types="vite/client" />

/**
 * Bridge LEGADO (Etapa E4): o subconjunto de `window.baixaria` que as telas estacionadas do Academy
 * ainda chamam. Na Etapa E5 ele é trocado por `PlatformBridge` + `DatabaseAdapter`, e este arquivo some.
 */
export interface AcademyLegacyBridge {
  db(op: string, args?: Record<string, unknown>): Promise<unknown>;
  chooseExportPath(kind: 'midi' | 'wav' | 'pdf' | 'txt' | 'json', suggestedName: string): Promise<{ canceled: true } | { canceled: false; path: string }>;
  writeExportFile(path: string, bytes: Uint8Array): Promise<{ bytes: number }>;
  exportMapPdf(path: string, map: unknown): Promise<unknown>;
}

declare global {
  interface Window {
    baixaria: AcademyLegacyBridge;
  }
}
