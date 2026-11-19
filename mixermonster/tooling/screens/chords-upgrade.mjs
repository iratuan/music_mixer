#!/usr/bin/env node
/**
 * Atualização da análise para a versão 2 (acordes estendidos e inversões) numa música real:
 * cópia mínima da biblioteca com a análise antiga; o aviso aparece, "Atualizar análise" refaz e o
 * aviso some; a régua passa a mostrar acordes com inversão quando há.
 * Uso: node tooling/screens/chords-upgrade.mjs <userData> <id> [captura.png]
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [src, id, shot] = process.argv.slice(2);
const userData = mkdtempSync(join(tmpdir(), 'bf-chords-'));
const index = JSON.parse(readFileSync(join(src, 'library', 'index.json'), 'utf8'));
index.songs = index.songs.filter((s) => s.id === id);
mkdirSync(join(userData, 'library', 'songs', id), { recursive: true });
writeFileSync(join(userData, 'library', 'index.json'), JSON.stringify(index, null, 2));
copyFileSync(join(src, 'library', 'songs', id, 'analise.json'), join(userData, 'library', 'songs', id, 'analise.json'));
// As faixas do Demucs (lidas pela análise) entram por junção: nada é copiado nem alterado.
symlinkSync(join(src, 'library', 'songs', id, 'demucs'), join(userData, 'library', 'songs', id, 'demucs'), 'junction');
const check = (cond, msg) => {
  if (!cond) throw new Error(`verificação falhou: ${msg}`);
  console.log(`ok: ${msg}`);
};
const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, NODE_ENV: 'production', BF_USER_DATA: userData, BF_AUDIO_SINK: 'none' } });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.setViewportSize({ width: 1280, height: 820 });
  await win.locator('.lib-card').first().click();
  await win.locator('.lane').first().waitFor({ timeout: 120000 });
  const note = win.getByText(/Acordes mais detalhados disponíveis/);
  await note.waitFor();
  check(true, 'aviso de análise antiga');
  const t0 = Date.now();
  await win.getByRole('button', { name: 'Atualizar análise' }).click();
  await note.waitFor({ state: 'detached', timeout: 600000 });
  const err = await win.locator('.alert').first().innerText().catch(() => '');
  if (err) console.log('erro na tela:', err);
  await win.locator('.lane').first().waitFor({ timeout: 120000 });
  console.log(`análise refeita em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const a = JSON.parse(readFileSync(join(userData, 'library', 'songs', id, 'analise.json'), 'utf8'));
  const chords = a.bars.flatMap((b) => b.chords.map((c) => c.chord).filter(Boolean));
  const inv = chords.filter((c) => c.bass !== undefined).length;
  const ext = chords.filter((c) => ['maj7', 'sus2', 'sus4', 'dim', 'm7b5'].includes(c.quality)).length;
  check(a.version === 2, `análise versão 2 (${chords.length} acordes; ${inv} com inversão; ${ext} estendidos)`);
  const titles = await win.locator('.rbar').evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''));
  check(inv === 0 || titles.some((t) => /\/[A-G]/.test(t)), 'régua mostra inversões (C/E)');
  if (shot) await win.screenshot({ path: shot });
} finally {
  await app.close();
  // Desfaz a junção (só o atalho; as faixas reais ficam intactas).
  unlinkSync(join(userData, 'library', 'songs', id, 'demucs'));
}
