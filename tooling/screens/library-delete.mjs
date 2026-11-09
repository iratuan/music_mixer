#!/usr/bin/env node
/**
 * Exclusão na biblioteca, no Electron real, com uma biblioteca isolada de músicas falsas
 * (só o índice e as pastas): lixeira no cartão com confirmação, exclusão da música aberta e
 * exclusão em lote pelo modo de seleção.
 * Uso: npm run build && node tooling/screens/library-delete.mjs [pasta para capturas]
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = process.argv[2];
const userData = mkdtempSync(join(tmpdir(), 'bf-del-'));
const ids = ['a1a1a1a1a1a1a1a1', 'b2b2b2b2b2b2b2b2', 'c3c3c3c3c3c3c3c3', 'd4d4d4d4d4d4d4d4'];
const names = ['Primeira.mp3', 'Segunda.mp3', 'Terceira.mp3', 'Quarta.mp3'];
mkdirSync(join(userData, 'library', 'songs'), { recursive: true });
const songs = ids.map((id, i) => {
  mkdirSync(join(userData, 'library', 'songs', id), { recursive: true });
  writeFileSync(join(userData, 'library', 'songs', id, 'analise.json'), '{}');
  return { id, name: names[i], addedAt: new Date(2026, 0, i + 1).toISOString(), sourcePath: `C:\\musicas\\${names[i]}`, stems: null, origin: { kind: 'file' } };
});
writeFileSync(join(userData, 'library', 'index.json'), JSON.stringify({ version: 1, songs }, null, 2));
const dir = (id) => join(userData, 'library', 'songs', id);

const b_isGrey = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return Math.max(r, g, b) - Math.min(r, g, b) < 30; };
const check = (cond, msg) => {
  if (!cond) throw new Error(`verificação falhou: ${msg}`);
  console.log(`ok: ${msg}`);
};
const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, NODE_ENV: 'production', BF_USER_DATA: userData, BF_AUDIO_SINK: 'none' } });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.setViewportSize({ width: 1280, height: 820 });
  const nav = win.getByRole('navigation', { name: 'Navegação principal' });
  const cards = win.locator('.lib-card');
  await cards.first().waitFor();
  check((await cards.count()) === 4, '4 músicas na biblioteca');

  // 1. Lixeira → confirmação → cancelar não apaga
  await win.locator('.lib-item').filter({ hasText: 'Primeira' }).hover();
  await win.getByRole('button', { name: 'Excluir Primeira' }).click();
  const dlg = win.getByRole('alertdialog', { name: 'Excluir Primeira?' });
  await dlg.waitFor();
  if (shots) await win.screenshot({ path: join(shots, 'lib-excluir-confirmar.png') });
  await dlg.getByRole('button', { name: 'Cancelar' }).click();
  check((await cards.count()) === 4 && existsSync(dir(ids[0])), 'cancelar mantém a música');

  // 2. Abrir a Segunda, voltar e excluí-la: some do menu "Tocando" e a pasta é apagada
  await cards.filter({ hasText: 'Segunda' }).click();
  await nav.getByRole('button', { name: /Segunda/ }).waitFor();
  await nav.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await win.locator('.lib-item').filter({ hasText: 'Segunda' }).hover();
  await win.getByRole('button', { name: 'Excluir Segunda' }).click();
  await win.getByRole('alertdialog', { name: 'Excluir Segunda?' }).getByRole('button', { name: 'Excluir' }).click();
  await win.getByText('Música excluída.').waitFor();
  check((await cards.count()) === 3 && !existsSync(dir(ids[1])), 'excluir apaga a música e a pasta dela');
  check((await nav.getByRole('button', { name: /Segunda/ }).count()) === 0, 'a música aberta sai do menu ao ser excluída');

  // 3. Modo de seleção: duas músicas, confirmação em dois passos
  await win.getByRole('button', { name: 'Selecionar', exact: true }).click();
  await win.getByRole('checkbox', { name: 'Selecionar Primeira' }).click();
  await win.getByRole('checkbox', { name: 'Selecionar Quarta' }).click();
  check((await win.locator('.select-bar b').innerText()) === '2 selecionadas', 'duas selecionadas');
  await win.getByRole('button', { name: /Excluir \(2\)/ }).click();
  await win.waitForTimeout(400);
  const bg = await win.getByRole('button', { name: /Confirmar: excluir 2/ }).evaluate((b) => getComputedStyle(b).backgroundColor);
  check(!b_isGrey(bg), `botão de confirmar em destaque (${bg})`);
  if (shots) await win.screenshot({ path: join(shots, 'lib-excluir-lote.png') });
  check((await cards.count()) === 3, 'primeiro clique só pede confirmação');
  await win.getByRole('button', { name: /Confirmar: excluir 2/ }).click();
  await win.getByText('2 músicas excluídas.').waitFor();
  check((await cards.count()) === 1 && !existsSync(dir(ids[0])) && !existsSync(dir(ids[3])) && existsSync(dir(ids[2])), 'exclusão em lote apaga só as selecionadas');
  check((await win.locator('.select-bar').count()) === 0, 'sai do modo de seleção');
} finally {
  await app.close();
}
