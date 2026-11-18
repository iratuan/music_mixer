import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { createAcademyData } from '../data/services.js';
import type { PlatformBridge, SaveKind, SaveResult } from './bridge.js';
import { sqlJsAdapter, type SqlJsStatic } from './sqljs.js';

/**
 * Plataforma "navegador": SQLite (sql.js/WebAssembly) persistido no IndexedDB deste site e arquivos
 * salvos pelo seletor do navegador (File System Access) ou por download.
 */

const IDB_NAME = 'academy';
const IDB_STORE = 'files';
const DB_KEY = 'academy.sqlite';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'));
  });
}

async function idbGet(key: string): Promise<Uint8Array | null> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result instanceof Uint8Array ? req.result : null);
    req.onerror = () => reject(req.error ?? new Error('falha ao ler o banco'));
  });
}

async function idbPut(key: string, bytes: Uint8Array): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('falha ao gravar o banco'));
  });
}

const MIME: Record<SaveKind, string> = {
  json: 'application/json',
  txt: 'text/plain;charset=utf-8',
  pdf: 'application/pdf',
  midi: 'audio/midi',
  wav: 'audio/wav',
};
const EXT: Record<SaveKind, string> = { json: '.json', txt: '.txt', pdf: '.pdf', midi: '.mid', wav: '.wav' };

type SavePicker = (opts: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<{
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}>;

async function saveFile(suggestedName: string, bytes: Uint8Array, kind: SaveKind): Promise<SaveResult> {
  const name = suggestedName.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) + EXT[kind];
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[kind] });
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name, types: [{ description: kind.toUpperCase(), accept: { [MIME[kind].split(';')[0]!]: [EXT[kind]] } }] });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return 'saved';
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'canceled';
      throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

export const webBridge: PlatformBridge = { kind: 'web', saveFile };

/** Abre o banco salvo neste navegador (ou cria um novo) e devolve as operações de dados. */
export async function openWebData() {
  const SQL = (await initSqlJs({ locateFile: () => wasmUrl })) as SqlJsStatic;
  const initial = await idbGet(DB_KEY);
  return createAcademyData(sqlJsAdapter(SQL, initial, (bytes) => idbPut(DB_KEY, bytes)));
}
