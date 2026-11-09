#!/usr/bin/env node
// Diagnóstico visual: captura a janela da tela pedida e mede elementos-chave.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const screen = process.env.BF_DEBUG_SCREEN ?? 'library';
const out = join(root, 'docs', 'screens', `debug-${screen}${process.env.BF_DEBUG_THEME ? `-${process.env.BF_DEBUG_THEME}` : ''}.png`);
const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, BF_SMOKE_SCREEN: screen } });
try {
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1200, height: 800 });
  await win.waitForTimeout(1500);
  const theme = process.env.BF_DEBUG_THEME;
  if (theme) {
    await win.evaluate((t) => localStorage.setItem('bf-theme', t), theme);
    await win.reload();
  }
  await win.waitForTimeout(1500);
  const m = await win.evaluate(() => {
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), op: cs.opacity, vis: cs.visibility, disp: cs.display }; };
    return { shell: r('.shell'), side: r('.side'), content: r('.content'), screen: r('.screen'), h1: r('h1') };
  });
  console.log(JSON.stringify(m));
  await win.screenshot({ path: out, fullPage: process.env.BF_DEBUG_FULL === '1' });
  console.log('saved', out);
} finally {
  await app.close();
}
