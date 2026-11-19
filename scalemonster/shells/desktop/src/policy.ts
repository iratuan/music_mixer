/**
 * Regras do shell desktop do Academy. Módulo PURO (sem 'electron' nem fs): testado em
 * ./tests/desktop-policy.test.ts.
 */
import path from 'node:path';

/**
 * Identidade oficial (Decisão 1, 2026-11-18): ScaleMonster. Não mudar depois de distribuir: a pasta de
 * dados guarda o progresso do aluno e o appId identifica o app no Windows e no Android.
 */
export const APP_ID = 'br.local.scalemonster';
export const PRODUCT_NAME = 'ScaleMonster';
export const USER_DATA_DIR = 'scalemonster';

/** Banco do app antigo (mixerCraft com o Academy embutido), oferecido para importação. */
export const LEGACY_DIR = 'baixaria-fina';
export const LEGACY_DB = 'mixercraft.sqlite';

export const DB_FILE = 'academy.sqlite';
export const BACKUP_DIR = 'backups';
export const BACKUPS_KEPT = 3;
export const LEGACY_DECISION_FILE = 'legacy-import.json';

/** Protocolo próprio: origem estável para IndexedDB, fetch do WebAssembly e CSP 'self'. */
export const APP_SCHEME = 'academy';
export const APP_HOST = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export const MAX_DB_BYTES = 256 * 1024 * 1024;
export const MAX_SAVE_BYTES = 50 * 1024 * 1024;

export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
} as const;

/** Igual à do Mixer, mais 'wasm-unsafe-eval' (SQLite em WebAssembly) e blob: para imagens geradas. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

export const SAVE_KINDS = { json: '.json', txt: '.txt', pdf: '.pdf', midi: '.mid', wav: '.wav' } as const;
export type SaveKind = keyof typeof SAVE_KINDS;
export const isSaveKind = (v: unknown): v is SaveKind => typeof v === 'string' && Object.hasOwn(SAVE_KINDS, v);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
export const mimeOf = (file: string): string => MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/** Nome de arquivo seguro para o diálogo de salvar, com a extensão do tipo. */
export function saveFileName(input: unknown, kind: SaveKind): string {
  const raw = typeof input === 'string' ? input : '';
  const base = raw.replace(/[\\/:*?"<>|\0]/g, '_').replace(/\.+$/, '').trim().slice(0, 120) || 'exportacao';
  const ext = SAVE_KINDS[kind];
  return base.toLowerCase().endsWith(ext) ? base : base + ext;
}

/** Caminho de um recurso do app dentro da pasta do renderer; null se sair dela. */
export function resolveAppAsset(rendererRoot: string, url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (`${u.protocol}//${u.host}` !== APP_ORIGIN) return null;
  const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
  const root = path.resolve(rendererRoot);
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

export const isAppUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}` === APP_ORIGIN;
  } catch {
    return false;
  }
};

/** Cabeçalho de todo arquivo SQLite 3. Rejeita gravações que não sejam um banco. */
const SQLITE_HEADER = 'SQLite format 3\u0000';
export function isSqliteFile(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 100) return false;
  for (let i = 0; i < SQLITE_HEADER.length; i++) if (bytes[i] !== SQLITE_HEADER.charCodeAt(i)) return false;
  return true;
}

/** Nome do backup: carimbo de data ordenável (os mais antigos saem primeiro). */
export function backupName(date: Date, tag = 'inicio'): string {
  const s = date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  return `academy-${s}-${tag}.sqlite`;
}

/** Backups a apagar para manter só os `keep` mais recentes. */
export function backupsToPrune(names: readonly string[], keep = BACKUPS_KEPT): string[] {
  const ours = names.filter((n) => /^academy-\d{8}-\d{6}-[a-z-]+\.sqlite$/.test(n)).sort();
  return ours.slice(0, Math.max(0, ours.length - keep));
}
