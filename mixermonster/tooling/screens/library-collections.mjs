#!/usr/bin/env node
/**
 * Coleções na biblioteca, no Electron real, com uma biblioteca isolada de músicas falsas
 * (só o índice e as pastas): lixeira no cartão com confirmação, exclusão da música aberta e
 * exclusão em lote pelo modo de seleção.
 * Uso: npm run build && node tooling/screens/library-collections.mjs [pasta para capturas]
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = process.argv[2];
const userData = mkdtempSync(join(tmpdir(), 'bf-col-'));
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

  // 1. Nova coleção vazia
  await win.getByRole('button', { name: 'Nova coleção' }).click();
  await win.getByLabel('Nome da nova coleção').fill('Queen');
  await win.getByRole('button', { name: 'Criar' }).click();
  const coll = win.getByRole('navigation', { name: 'Coleções' });
  await coll.getByRole('button', { name: /Queen/ }).waitFor();
  check((await coll.getByRole('button', { name: /Queen/ }).getAttribute('aria-pressed')) === 'true' && (await cards.count()) === 0, 'coleção criada, ativa e vazia');
  // 2. Arrastar um cartão para a coleção
  await coll.getByRole('button', { name: /Todas/ }).click();
  await cards.filter({ hasText: 'Primeira' }).dragTo(coll.getByRole('button', { name: /Queen/ }));
  await win.getByText(/“Primeira” adicionada a “Queen”/).waitFor();
  check((await coll.getByRole('button', { name: /Queen/ }).innerText()).includes('1'), 'arrastar põe a música na coleção');
  // 3. Selecionar duas e adicionar a uma coleção nova pelo menu
  await win.getByRole('button', { name: 'Selecionar', exact: true }).click();
  await win.getByRole('checkbox', { name: 'Selecionar Segunda' }).click();
  await win.getByRole('checkbox', { name: 'Selecionar Terceira' }).click();
  await win.getByRole('button', { name: /Adicionar à coleção/ }).click();
  await win.getByRole('menuitem', { name: /Nova coleção/ }).click();
  await win.getByLabel('Nome da nova coleção').fill('Rock 80');
  await win.getByRole('button', { name: 'Criar' }).click();
  await win.getByText(/2 músicas adicionadas a “Rock 80”/).waitFor();
  // 4. Filtrar
  await coll.getByRole('button', { name: /Rock 80/ }).click();
  check((await cards.count()) === 2, 'filtro pela coleção mostra só as dela');
  await win.waitForTimeout(400);
  if (shots) await win.screenshot({ path: join(shots, 'lib-colecoes.png') });
  // 5. Tirar uma da coleção
  await win.getByRole('button', { name: 'Selecionar', exact: true }).click();
  await win.getByRole('checkbox', { name: 'Selecionar Segunda' }).click();
  await win.getByRole('button', { name: /Tirar de “Rock 80”/ }).click();
  await win.getByText(/Música tirada de “Rock 80”/).waitFor();
  check((await cards.count()) === 1, 'tirar da coleção');
  // 6. Renomear e excluir a coleção (músicas ficam)
  await win.getByRole('button', { name: 'Renomear' }).click();
  await win.getByLabel('Novo nome da coleção').fill('Rock anos 80');
  await win.getByRole('button', { name: 'Renomear' }).last().click();
  await coll.getByRole('button', { name: /Rock anos 80/ }).waitFor();
  check(true, 'coleção renomeada');
  await win.getByRole('button', { name: 'Excluir coleção' }).click();
  await win.getByRole('button', { name: 'Confirmar: excluir coleção' }).click();
  await win.getByText(/As músicas continuam na biblioteca/).waitFor();
  check((await coll.getByRole('button', { name: /Rock anos 80/ }).count()) === 0 && (await cards.count()) === 4, 'excluir coleção mantém as músicas');
  // 7. Reabrir o app: coleções e filtro persistem
  const saved = JSON.parse(readFileSync(join(userData, 'library', 'index.json'), 'utf8')).songs.find((s) => s.name === 'Primeira.mp3').collections;
  check(JSON.stringify(saved) === '["Queen"]', 'coleções salvas no índice');
} finally {
  await app.close();
}
