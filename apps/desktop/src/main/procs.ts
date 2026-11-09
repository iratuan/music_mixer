/**
 * Processos auxiliares (Python, yt-dlp, ffmpeg, Rubber Band): controle de ciclo de vida.
 *
 * - Todo processo filho fica registrado enquanto vive; ao fechar o app, todos são encerrados
 *   (senão a separação continua rodando escondida, ocupando CPU/GPU por até uma hora).
 * - No Windows, `child.kill()` só encerra o processo direto: o separador de voz abre o ffmpeg,
 *   que sobreviveria. `killTree` usa `taskkill /T /F` para levar a árvore toda.
 * - `single` junta pedidos iguais em andamento (mesma análise, mesmo MIDI): sem dois processos
 *   escrevendo o mesmo arquivo temporário.
 * - `logLine` grava falhas em userData/logs/main.log (rotação simples em 1 MB) para diagnóstico.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import path from 'node:path';

const live = new Set<ChildProcess>();

export function track<T extends ChildProcess>(child: T): T {
  live.add(child);
  const done = () => live.delete(child);
  child.once('exit', done);
  child.once('error', done);
  return child;
}

export function killTree(child: ChildProcess | null | undefined): void {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
    } catch {
      child.kill();
    }
  } else child.kill('SIGKILL');
}

export function killAll(): number {
  const n = live.size;
  for (const c of live) killTree(c);
  live.clear();
  return n;
}

export function liveCount(): number {
  return live.size;
}

const inFlight = new Map<string, Promise<unknown>>();

/** Chaves de pedidos em andamento (análise, MIDI): a compactação espera que acabem. */
export function busyKeys(): string[] {
  return [...inFlight.keys()];
}

/** Um pedido por chave: quem chega enquanto o primeiro roda recebe o mesmo resultado. */
export function single<T>(key: string, run: () => Promise<T>): Promise<T> {
  const cur = inFlight.get(key) as Promise<T> | undefined;
  if (cur) return cur;
  const p = run().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

let logFile = '';
const LOG_MAX = 1024 * 1024;

export function initLog(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'main.log');
  } catch {
    logFile = '';
  }
}

export function logLine(...parts: unknown[]): void {
  if (!logFile) return;
  try {
    if (existsSync(logFile) && statSync(logFile).size > LOG_MAX) renameSync(logFile, `${logFile}.1`);
    const text = parts.map((p) => (p instanceof Error ? `${p.message}\n${p.stack ?? ''}` : typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    appendFileSync(logFile, `${new Date().toISOString()} ${text}\n`);
  } catch {
    /* log é melhor esforço */
  }
}

/** Espaço livre (bytes) no disco da pasta; null se não der para medir. */
export async function freeBytes(dir: string): Promise<number | null> {
  try {
    const s = await statfs(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** Erro claro quando falta espaço (antes de começar, não no meio da gravação). */
export async function requireFree(dir: string, bytes: number, what: string): Promise<void> {
  const free = await freeBytes(dir);
  if (free !== null && free < bytes) {
    const gb = (n: number) => (n / 1024 ** 3).toFixed(1).replace('.', ',');
    throw new Error(`pouco espaço em disco para ${what}: livres ${gb(free)} GB, precisa de ~${gb(bytes)} GB`);
  }
}
