#!/usr/bin/env node
// Diagnóstico: abre uma instância nova e chama os canais da biblioteca pela ponte do preload.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = await electron.launch({ args: [root], cwd: root });
try {
  const win = await app.firstWindow();
  await win.waitForTimeout(1500);
  const result = await win.evaluate(async () => {
    const out = {};
    out.hasApi = typeof window.baixaria === 'object';
    for (const [k, fn] of [['libraryList', () => window.baixaria.libraryList()], ['libraryAddBogus', () => window.baixaria.libraryAdd('', 'x')]]) {
      try { out[k] = { ok: true, value: JSON.stringify(await fn()).slice(0, 120) }; } catch (e) { out[k] = { ok: false, error: String(e.message ?? e).slice(0, 160) }; }
    }
    return out;
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.close();
}
