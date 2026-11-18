import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { createAcademyData } from '../data/services.js';
import type { PlatformBridge, SaveKind, SaveResult } from './bridge.js';
import { sqlJsAdapter, type SqlJsStatic } from './sqljs.js';

/**
 * Plataforma "android" (Capacitor): o mesmo build web no WebView do sistema. O banco é um arquivo na
 * área privada do app (Directory.Data, apagado só com "limpar dados"/desinstalar), gravado de forma
 * atômica, com backups dos 3 últimos inícios. Salvar arquivos usa a folha de compartilhamento.
 * O DatabaseAdapter continua o mesmo; trocar por SQLite nativo depois não muda as regras.
 */

const DB_FILE = 'scalemonster.sqlite';
const BACKUP_DIR = 'backups';
const BACKUPS_KEPT = 3;
const DATA = Directory.Data;

export const isAndroid = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function exists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: DATA });
    return true;
  } catch {
    return false;
  }
}

async function readDb(): Promise<Uint8Array | null> {
  if (!(await exists(DB_FILE))) return null;
  const r = await Filesystem.readFile({ path: DB_FILE, directory: DATA });
  return typeof r.data === 'string' ? fromBase64(r.data) : new Uint8Array(await r.data.arrayBuffer());
}

/** Grava num temporário e renomeia: um corte de energia no meio não deixa o banco pela metade. */
async function writeDb(bytes: Uint8Array): Promise<void> {
  const tmp = `${DB_FILE}.tmp`;
  await Filesystem.writeFile({ path: tmp, directory: DATA, data: toBase64(bytes) });
  await Filesystem.rename({ from: tmp, to: DB_FILE, directory: DATA, toDirectory: DATA });
}

/** Cópia do banco a cada início; ficam as 3 mais recentes (nomes com data ordenável). */
async function backupOnStart(): Promise<void> {
  if (!(await exists(DB_FILE))) return;
  if (!(await exists(BACKUP_DIR))) await Filesystem.mkdir({ path: BACKUP_DIR, directory: DATA, recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  await Filesystem.copy({ from: DB_FILE, to: `${BACKUP_DIR}/scalemonster-${stamp}-inicio.sqlite`, directory: DATA, toDirectory: DATA });
  const files = (await Filesystem.readdir({ path: BACKUP_DIR, directory: DATA })).files.map((f) => f.name).filter((n) => /^scalemonster-\d{8}-\d{6}-[a-z-]+\.sqlite$/.test(n)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - BACKUPS_KEPT))) await Filesystem.deleteFile({ path: `${BACKUP_DIR}/${old}`, directory: DATA });
}

const EXT: Record<SaveKind, string> = { json: '.json', txt: '.txt', pdf: '.pdf', midi: '.mid', wav: '.wav' };

/** Grava no cache do app e abre "Compartilhar": o aluno escolhe Salvar em Arquivos, Drive, e-mail… */
async function saveFile(suggestedName: string, bytes: Uint8Array, kind: SaveKind): Promise<SaveResult> {
  const name = suggestedName.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) + EXT[kind];
  const { uri } = await Filesystem.writeFile({ path: `export/${name}`, directory: Directory.Cache, data: toBase64(bytes), recursive: true });
  try {
    await Share.share({ title: name, files: [uri] });
    return 'saved';
  } catch (e) {
    if (/cancel/i.test(String((e as { message?: string }).message ?? e))) return 'canceled';
    throw e;
  }
}

export const androidBridge: PlatformBridge = { kind: 'android', saveFile };

export async function openAndroidData() {
  await backupOnStart().catch(() => undefined);
  const SQL = (await initSqlJs({ locateFile: () => wasmUrl })) as SqlJsStatic;
  return createAcademyData(sqlJsAdapter(SQL, await readDb(), writeDb));
}

/**
 * Botão Voltar do Android: volta no histórico do app (fecha o "Mais", volta de tela); na tela raiz,
 * sai do app. A profundidade vem do estado de navegação gravado pelo App.tsx.
 */
export function installAndroidBack(): void {
  void App.addListener('backButton', () => {
    const depth = (history.state as { depth?: number } | null)?.depth ?? 0;
    if (depth > 0) history.back();
    else void App.exitApp();
  });
}
