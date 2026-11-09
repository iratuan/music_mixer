#!/usr/bin/env node
// Diagnóstico: abre o app numa tela e mostra erros de console e o tamanho do DOM renderizado.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const screen = process.env.BF_DEBUG_SCREEN ?? 'library';
const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, BF_SMOKE_SCREEN: screen } });
try {
  const win = await app.firstWindow();
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await win.waitForTimeout(2500);
  const info = await win.evaluate(() => ({ html: document.body.innerHTML.length, title: document.title, root: document.getElementById('root')?.innerHTML.slice(0, 200) ?? null }));
  console.log(JSON.stringify(info));
  console.log(errors.slice(0, 10).join('\n') || 'sem erros de console');
} finally {
  await app.close();
}
