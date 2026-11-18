import type { AcademyData } from '../data/services.js';

/**
 * O que o Academy pede à plataforma (navegador, shell desktop, Android). As telas só falam com isto;
 * nada de `window.baixaria`, `electron` ou `node:*` fora de um shell.
 */
export type SaveKind = 'json' | 'txt' | 'pdf' | 'midi' | 'wav';
export type SaveResult = 'saved' | 'canceled';

export interface PlatformBridge {
  readonly kind: 'web' | 'desktop' | 'android';
  /** Salva bytes num arquivo escolhido (ou baixado) pelo usuário. */
  saveFile(suggestedName: string, bytes: Uint8Array, kind: SaveKind): Promise<SaveResult>;
  /** Mapa harmônico em PDF; ausente onde a plataforma não gera PDF (a tela oferece texto/JSON). */
  readonly exportMapPdf?: (suggestedName: string, map: unknown) => Promise<SaveResult>;
}

let current: { bridge: PlatformBridge; data: AcademyData } | null = null;

/** Chamado uma vez pelo ponto de entrada da plataforma, antes de montar a interface. */
export function installPlatform(bridge: PlatformBridge, data: AcademyData): void {
  current = { bridge, data };
}

export function platform(): PlatformBridge {
  if (!current) throw new Error('plataforma não inicializada');
  return current.bridge;
}

export function academyData(): AcademyData {
  if (!current) throw new Error('banco não inicializado');
  return current.data;
}
