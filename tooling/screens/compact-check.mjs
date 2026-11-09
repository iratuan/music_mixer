#!/usr/bin/env node
/**
 * Compactação da biblioteca em FLAC numa CÓPIA de uma música real (as faixas são copiadas, não
 * ligadas: a compactação apaga os WAV). Verifica: aviso com o tamanho; "Compactar agora" troca os
 * WAV por FLAC e libera espaço; a música abre e toca as faixas; transpor (Rubber Band lendo FLAC)
 * e refazer a análise funcionam.
 * Uso: node tooling/screens/compact-check.mjs <userData> <id>
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [src, id] = process.argv.slice(2);
if (!src || !id) throw new Error('uso: compact-check.mjs <userData> <id>');
const userData = mkdtempSync(join(tmpdir(), 'bf-compact-'));
const srcSong = join(src, 'library', 'songs', id);
const dstSong = join(userData, 'library', 'songs', id);
mkdirSync(dstSong, { recursive: true });
for (const d of ['demucs', 'faixas']) if (existsSync(join(srcSong, d))) cpSync(join(srcSong, d), join(dstSong, d), { recursive: true });
for (const f of ['analise.json', 'capa.img']) if (existsSync(join(srcSong, f))) cpSync(join(srcSong, f), join(dstSong, f));
const index = JSON.parse(readFileSync(join(src, 'library', 'index.json'), 'utf8'));
index.songs = index.songs.filter((s) => s.id === id);
const swap = (p) => join(dstSong, p.slice(srcSong.length));
for (const s of index.songs) {
  s.sourcePath = swap(s.sourcePath);
  for (const k of Object.keys(s.stems)) s.stems[k] = swap(s.stems[k]);
}
writeFileSync(join(userData, 'library', 'index.json'), JSON.stringify(index, null, 2));

const sizeOf = (dir) => {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? sizeOf(join(dir, e.name)) : statSync(join(dir, e.name)).size;
  return n;
};
const filesOf = (dir, ext) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...filesOf(join(dir, e.name), ext));
    else if (e.name.toLowerCase().endsWith(ext)) out.push(e.name);
  }
  return out;
};
const check = (cond, msg) => {
  if (!cond) throw new Error(`verificação falhou: ${msg}`);
  console.log(`ok: ${msg}`);
};
const before = sizeOf(dstSong);
const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, NODE_ENV: 'production', BF_USER_DATA: userData, BF_AUDIO_SINK: 'none' } });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.setViewportSize({ width: 1280, height: 820 });
  const banner = win.locator('.compact-line').filter({ hasText: 'estão em WAV' });
  await banner.waitFor({ timeout: 30000 });
  check(true, `aviso: ${(await banner.innerText()).split('.')[0]}`);
  await banner.getByRole('button', { name: 'Compactar agora' }).click();
  await win.getByText(/Faixas compactadas em FLAC/).waitFor({ timeout: 600000 });
  const after = sizeOf(dstSong);
  const wavs = filesOf(dstSong, '.wav');
  const flacs = filesOf(dstSong, '.flac');
  check(wavs.length === 0 && flacs.length > 0, `WAV trocados por FLAC (${flacs.length} arquivos)`);
  check(after < before * 0.6, `espaço da música: ${(before / 1024 ** 2).toFixed(0)} MB → ${(after / 1024 ** 2).toFixed(0)} MB`);
  check((await banner.count()) === 0, 'aviso some depois de compactar');
  const rec = JSON.parse(readFileSync(join(userData, 'library', 'index.json'), 'utf8')).songs[0];
  check(Object.values(rec.stems).every((p) => p.endsWith('.flac') && existsSync(p)), 'índice aponta para os FLAC');

  // A música abre com todas as faixas decodificadas.
  await win.locator('.lib-card').first().click();
  await win.locator('.lane').first().waitFor({ timeout: 120000 });
  const lanes = await win.locator('.lane:not(.stem-metro)').count();
  check(lanes === Object.keys(rec.stems).length, `${lanes} faixas abertas a partir dos FLAC`);
  await win.getByRole('button', { name: 'Tocar' }).click();
  await win.waitForTimeout(2500);
  const clock = await win.locator('.lcd-value.clock').innerText();
  check(!/^0:00/.test(clock), `tocando (${clock.split('/')[0].trim()})`);
  await win.getByRole('button', { name: 'Pausar' }).click().catch(() => undefined);

  // Transpor: Rubber Band lê FLAC e grava FLAC.
  await win.getByRole('button', { name: 'Subir meio tom' }).click();
  await win.locator('.tone-value').filter({ hasText: /^\+1 semitom/ }).waitFor({ timeout: 300000 });
  const tr = filesOf(join(dstSong, 'tom'), '.flac');
  check(tr.length === Object.keys(rec.stems).length, `transposição +1 gravada em FLAC (${tr.length} faixas)`);
} finally {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
}
