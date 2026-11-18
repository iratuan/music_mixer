import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { freeBytes, initLog, killAll, liveCount, logLine, requireFree, single, track } from '../src/main/procs.js';

describe('processos auxiliares', () => {
  it('pedidos iguais em andamento viram um só', async () => {
    let runs = 0;
    const job = () =>
      new Promise<number>((r) => {
        runs++;
        setTimeout(() => r(runs), 20);
      });
    const [a, b] = await Promise.all([single('x', job), single('x', job)]);
    expect(runs).toBe(1);
    expect(a).toBe(b);
    await single('x', job); // terminado: roda de novo
    expect(runs).toBe(2);
  });

  it('erro libera a chave', async () => {
    await expect(single('y', () => Promise.reject(new Error('falhou')))).rejects.toThrow('falhou');
    await expect(single('y', () => Promise.resolve(1))).resolves.toBe(1);
  });

  it('encerra os processos vivos ao sair', async () => {
    const child = track(spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' }));
    expect(liveCount()).toBe(1);
    const gone = new Promise((r) => child.once('exit', r));
    expect(killAll()).toBe(1);
    await gone;
    expect(liveCount()).toBe(0);
  });

  it('espaço em disco: mede e recusa antes de começar', async () => {
    const dir = tmpdir();
    const free = await freeBytes(dir);
    expect(free).toBeGreaterThan(0);
    await expect(requireFree(dir, 1, 'teste')).resolves.toBeUndefined();
    await expect(requireFree(dir, Number.MAX_SAFE_INTEGER, 'separar as faixas')).rejects.toThrow(/pouco espaço em disco para separar as faixas/);
  });

  it('registro grava linhas com data', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bf-log-'));
    initLog(dir);
    logLine('python falhou', new Error('boom'));
    const text = readFileSync(path.join(dir, 'main.log'), 'utf8');
    expect(text).toMatch(/^\d{4}-\d\d-\d\dT.* python falhou boom/);
  });
});
