#!/usr/bin/env node
/**
 * Importação de exercício no ScaleMonster (Prática → Música → Exercícios importados).
 *  - exercício válido: aparece na biblioteca e sobrevive ao recarregar;
 *  - exercício inválido: mensagem com os campos com problema e nada muda;
 *  - "Tocar" abre o exercício no treino; "Remover" tira da biblioteca.
 * Uso: npm run build && npm run preview  (em outro terminal)
 *      node ./tooling/exercise-import-check.mjs [url]
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:4174';
const fixture = (name) => readFileSync(fileURLToPath(new URL(`../tests/fixtures/exchange/${name}`, import.meta.url)));

const failures = [];
const check = (ok, msg) => (ok ? console.log(`  ok ${msg}`) : (failures.push(msg), console.log(`  FALHOU ${msg}`)));

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' })).catch(() => chromium.launch());
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${base}/?screen=exercises`);
await page.getByRole('tab', { name: 'Música' }).click();
const file = page.locator('input[type=file][aria-label="Arquivo do pacote da música"]').first();

await file.setInputFiles({ name: 'exercicio.mcraft-pack', mimeType: 'application/octet-stream', buffer: fixture('exercicio-exemplo.mcraft-pack') });
const lib = page.getByRole('region', { name: 'Biblioteca de exercícios' });
check(await lib.getByText('Lá menor, 2 compassos', { exact: true }).isVisible(), 'exercício válido entra na biblioteca');

await file.setInputFiles({ name: 'invalido.mcraft-pack', mimeType: 'application/octet-stream', buffer: fixture('exercicio-invalido.mcraft-pack') });
const alert = page.getByRole('alert').filter({ hasText: 'exercício inválido' });
check(await alert.isVisible(), 'exercício inválido mostra o motivo');
check((await alert.textContent())?.includes('bpm') === true, 'a mensagem cita o campo com problema (bpm)');
check(await lib.getByText('Lá menor, 2 compassos', { exact: true }).isVisible(), 'a biblioteca continua com o item válido depois do erro');

await page.reload();
await page.getByRole('tab', { name: 'Música' }).click();
check(await page.getByRole('region', { name: 'Biblioteca de exercícios' }).getByText('Lá menor, 2 compassos', { exact: true }).isVisible(), 'exercício continua depois de recarregar');

await page.getByRole('region', { name: 'Biblioteca de exercícios' }).getByRole('button', { name: 'Tocar' }).click();
check(await page.getByRole('heading', { name: 'Lá menor, 2 compassos' }).waitFor({ timeout: 5000 }).then(() => true, () => false), '"Tocar" abre o exercício no treino');

await page.reload();
await page.getByRole('tab', { name: 'Música' }).click();
await page.getByRole('region', { name: 'Biblioteca de exercícios' }).getByRole('button', { name: 'Remover Lá menor, 2 compassos' }).click();
check((await page.getByRole('region', { name: 'Biblioteca de exercícios' }).getByText('Lá menor, 2 compassos', { exact: true }).count()) === 0, '"Remover" tira o exercício da biblioteca');
check(errors.length === 0, `sem erros na página${errors.length ? `: ${errors.join(' | ')}` : ''}`);

await browser.close();
console.log(failures.length ? `\n${failures.length} falha(s).` : '\nImportação de exercício OK.');
process.exit(failures.length ? 1 : 0);
