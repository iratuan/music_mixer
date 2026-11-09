#!/usr/bin/env node
/**
 * Mede o custo da tela durante a reprodução: CPU do processo da janela (renderer) e quantos
 * quadros o React redesenhou, tocando a mesma música por 10 s.
 * Uso: node tooling/screens/perf-check.mjs <userData com uma música separada> [Baixaria Fina.exe]
 * Sem o .exe, roda o build do projeto (dist/).
 */
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [srcUserData, exe] = process.argv.slice(2);
if (!srcUserData) throw new Error('uso: perf-check.mjs <userData> [exe]');
const userData = mkdtempSync(join(tmpdir(), 'bf-perf-'));
cpSync(srcUserData, userData, { recursive: true });
const env = { ...process.env, NODE_ENV: 'production', BF_USER_DATA: userData, BF_AUDIO_SINK: 'none' };
const app = exe ? await electron.launch({ executablePath: exe, env }) : await electron.launch({ args: [root], cwd: root, env });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.setViewportSize({ width: 1280, height: 820 });
  await win.locator('.lib-card').first().click();
  await win.locator('.lane').first().waitFor({ timeout: 60000 });
  await win.waitForTimeout(2000);
  // Conta mutações do DOM (cada redesenho do React mexe em vários nós).
  await win.evaluate(() => {
    window.__muts = 0;
    new MutationObserver((l) => (window.__muts += l.length)).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await win.getByRole('button', { name: 'Tocar' }).click();
  await win.waitForTimeout(1000);
  const cpu = () =>
    app.evaluate(({ app: a, BrowserWindow }) => {
      const pid = BrowserWindow.getAllWindows()[0].webContents.getOSProcessId();
      const m = a.getAppMetrics().find((x) => x.pid === pid);
      return m ? m.cpu.cumulativeCPUUsage ?? null : null;
    });
  const m0 = await win.evaluate(() => window.__muts);
  const c0 = await cpu();
  const t0 = Date.now();
  await win.waitForTimeout(10000);
  const c1 = await cpu();
  const secs = (Date.now() - t0) / 1000;
  const muts = (await win.evaluate(() => window.__muts)) - m0;
  const out = { alvo: exe ?? 'dist (projeto)', segundos: secs, cpuSegundosRenderer: c0 !== null && c1 !== null ? Math.round((c1 - c0) * 1000) / 1000 : null, mutacoesDomPorSegundo: Math.round(muts / secs) };
  console.log(JSON.stringify(out));
} finally {
  await app.close();
}
