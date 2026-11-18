#!/usr/bin/env node
/**
 * E9: importação do .mcraft-pack no ScaleMonster (Prática → Música → Importar música).
 *  - pacote válido: a música aparece com título, compassos e tom; sobrevive ao recarregar;
 *  - pacote inválido (outro JSON, versão mais nova): mensagem de erro e nada muda.
 * Uso: npm run academy:build && npm run academy:preview  (em outro terminal)
 *      node tooling/academy/pack-import-check.mjs [url]
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4174';
const song = {
  title: 'Linha de teste',
  source: 'Baixo da gravação (transcrito)',
  key: 'Lá menor',
  bpm: 92,
  bars: Array.from({ length: 8 }, (_, i) => ({ chords: [i % 2 ? 'F' : 'Am'], notes: [{ midi: 45, beat: 0, len: 1 }, { midi: 48, beat: 1, len: 1 }, { midi: 52, beat: 2, len: 2 }] })),
  sections: [
    { name: 'Intro', from: 0, to: 3 },
    { name: 'Verso', from: 4, to: 7 },
  ],
};
const pack = (patch = {}) => Buffer.from(JSON.stringify({ format: 'mcraft-pack', version: 1, createdAt: new Date().toISOString(), app: { name: 'MixerMonster', version: 'teste' }, song, ...patch }));

const failures = [];
const check = (ok, msg) => (ok ? console.log(`  ok ${msg}`) : (failures.push(msg), console.log(`  FALHOU ${msg}`)));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${base}/?screen=exercises`);
await page.getByRole('tab', { name: 'Música' }).click();
const file = page.locator('input[type=file][aria-label="Arquivo do pacote da música"]').first();

await file.setInputFiles({ name: 'outro.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"outra-coisa"}') });
check(await page.getByRole('alert').filter({ hasText: 'não é um pacote do MixerMonster' }).isVisible(), 'recusa arquivo que não é pacote');

await file.setInputFiles({ name: 'novo.mcraft-pack', mimeType: 'application/octet-stream', buffer: pack({ version: 9 }) });
check(await page.getByRole('alert').filter({ hasText: 'atualize o ScaleMonster' }).isVisible(), 'versão mais nova pede atualização');

await file.setInputFiles({ name: 'Linha de teste.mcraft-pack', mimeType: 'application/octet-stream', buffer: pack() });
await page.getByRole('heading', { name: 'Linha de teste' }).waitFor({ timeout: 5000 });
check(await page.getByText('8 compassos · tom original Lá menor · 92 BPM').isVisible(), 'música importada (8 compassos, tom, andamento)');

await page.reload();
await page.getByRole('tab', { name: 'Música' }).click();
check(await page.getByRole('heading', { name: 'Linha de teste' }).isVisible(), 'música continua depois de recarregar');
check(errors.length === 0, `sem erros na página${errors.length ? `: ${errors.join(' | ')}` : ''}`);

await browser.close();
console.log(failures.length ? `\n${failures.length} falha(s).` : '\nImportação do pacote OK.');
process.exit(failures.length ? 1 : 0);
