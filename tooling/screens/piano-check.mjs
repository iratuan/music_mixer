#!/usr/bin/env node
/**
 * Confere o teclado do painel inferior numa música real que tenha a faixa de piano separada.
 * Usa uma cópia mínima da biblioteca (índice com uma música + análise); as faixas são lidas no lugar,
 * sem alteração. O MIDI do piano é gerado na cópia.
 * Uso: node tooling/screens/piano-check.mjs <userData> <id da música> [saída.png]
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [src, id, shot] = process.argv.slice(2);
if (!src || !id) throw new Error('uso: piano-check.mjs <userData> <id> [saída.png]');
const userData = mkdtempSync(join(tmpdir(), 'bf-piano-'));
const index = JSON.parse(readFileSync(join(src, 'library', 'index.json'), 'utf8'));
index.songs = index.songs.filter((s) => s.id === id);
if (!index.songs[0]?.stems?.piano) throw new Error('a música não tem a faixa de piano');
mkdirSync(join(userData, 'library', 'songs', id), { recursive: true });
writeFileSync(join(userData, 'library', 'index.json'), JSON.stringify(index, null, 2));
const an = join(src, 'library', 'songs', id, 'analise.json');
if (existsSync(an)) copyFileSync(an, join(userData, 'library', 'songs', id, 'analise.json'));

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
  await win.getByRole('button', { name: 'Tocar' }).click();
  await win.waitForTimeout(800);
  await win.getByRole('button', { name: 'Pausar' }).click();
  const t0 = Date.now();
  await win.getByRole('group', { name: 'Instrumento do painel' }).getByRole('button', { name: 'Piano' }).click();
  await win.locator('svg.piano').waitFor({ timeout: 600000 });
  console.log(`notas do piano extraídas em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // Vai para o meio da música e toca alguns segundos.
  const body = win.locator('.lane-body').first();
  const box = await body.boundingBox();
  await win.mouse.click(box.x + box.width * 0.45, box.y + 10);
  await win.getByRole('button', { name: 'Tocar' }).click();
  let lit = 0;
  for (let i = 0; i < 20 && lit === 0; i++) {
    await win.waitForTimeout(300);
    lit = await win.locator('.pkey.now').count();
  }
  const fill = await win.evaluate(() => {
    const sc = document.querySelector('.tl-scroll');
    const rows = [...document.querySelectorAll('.tl-row')].reduce((a, r) => a + r.getBoundingClientRect().height, 0);
    return { ratio: rows / sc.clientHeight, scroll: sc.scrollHeight > sc.clientHeight + 1, lanes: document.querySelectorAll('.lane:not(.stem-metro)').length, h: Math.round(document.querySelector('.lane').getBoundingClientRect().height) };
  });
  check(!fill.scroll && fill.ratio > 0.99 && fill.ratio < 1.01, `${fill.lanes} faixas ocupam toda a área, sem rolagem (${(fill.ratio * 100).toFixed(1)}%, ${fill.h} px cada)`);
  const keys = await win.locator('.pkey.white').count();
  const marked = await win.locator('.pkey.now, .pkey.next, .pkey.later, .pkey.done').count();
  const svgW = (await win.locator('svg.piano').boundingBox()).width;
  const dockW = (await win.locator('.dock').boundingBox()).width;
  check(keys >= 21, `teclado com ${keys} teclas brancas`);
  check(svgW > dockW - 80, `teclado ocupa a largura do painel (${Math.round(svgW)} de ${Math.round(dockW)} px)`);
  check(marked > 0, `notas do compasso marcadas (${marked}; ${lit} soando agora)`);
  await win.getByRole('button', { name: 'Nota', exact: true }).click();
  await win.waitForTimeout(400);
  console.log('cabeçalho:', await win.locator('.dock-neck-head .next-note').innerText().catch(() => '—'));
  if (shot) await win.screenshot({ path: shot });
  const hands = await win.locator('.next-note.hands').innerText();
  check(/esquerda/i.test(hands) && /direita/i.test(hands), `mãos do piano: ${hands.replace(/\s+/g, ' ')}`);
  check((await win.locator('.pkey.lh').count()) > 0 || (await win.locator('.pkey.suggest').count()) > 0, 'mão esquerda marcada no teclado (acorde base ou sugestão)');
  // Guia por harmonia (padrão): esquerda = base do acorde (3 notas), direita = arpejo numerado.
  check((await win.locator('.pkey.lh.base').count()) === 3 && (await win.locator('.pkey.rh').count()) >= 3, 'harmonia: base do acorde na esquerda e arpejo na direita');
  // Gravação: o que a faixa de piano toca
  const tGrav = Date.now();
  await win.getByRole('group', { name: 'Guia do piano' }).getByRole('button', { name: 'Gravação' }).click();
  await win.locator('svg.piano').waitFor({ timeout: 600000 });
  await win.waitForTimeout(500);
  console.log(`gravação do piano pronta em ${((Date.now() - tGrav) / 1000).toFixed(1)} s`);
  await win.getByRole('group', { name: 'Guia do piano' }).getByRole('button', { name: 'Harmonia' }).click();
  await win.getByRole('group', { name: 'Instrumento do painel' }).getByRole('button', { name: 'Baixo' }).click();
  await win.locator('svg.bass-neck').waitFor({ timeout: 300000 });
  check(true, 'volta para o braço do baixo');
  await win.getByRole('group', { name: 'Rótulo das notas' }).getByRole('button', { name: 'Dedo' }).click();
  await win.waitForTimeout(400);
  const fingers = await win.locator('.bass-neck .neck-note text').allTextContents();
  check(fingers.length > 0 && fingers.every((f) => /^[0-4]$/.test(f)), `dedos no braço: ${fingers.join(' ')}`);
  await win.waitForTimeout(600);
  const bassHead = await win.locator('.dock-neck-head .next-note').innerText().catch(() => '');
  check((await win.locator('.neck-zone').count()) === 1 && /mão nas casas/.test(bassHead), `zona da mão no braço: ${bassHead}`);
  // Aviso de troca de zona: procura um trecho com troca à frente (até 6 s) tocando a música.
  let warned = '';
  for (let k = 0; k < 40 && !warned; k++) {
    await win.waitForTimeout(250);
    if ((await win.locator('.neck-zone-next').count()) === 1) warned = await win.locator('.zone-next').innerText().catch(() => '');
  }
  check(/troca para/.test(warned), `aviso de troca de zona:${warned}`);
  if (shot) await win.screenshot({ path: shot.replace(/\.png$/, '-baixo.png') });

  // Mapa: partes na régua, painel, exportar PDF e texto
  await win.getByRole('button', { name: 'Pausar' }).click();
  const nSec = await win.locator('.rsec').count();
  check(nSec >= 2, `partes na régua: ${nSec}`);
  await win.getByRole('button', { name: 'Mapa', exact: true }).click();
  const rows = await win.locator('.map-row').count();
  const names = await win.locator('.map-name').evaluateAll((els) => els.map((e) => e.value));
  check(rows === nSec, `painel do mapa com ${rows} partes: ${names.join(', ')}`);
  // Loop de uma parte: o botão da 3ª parte toca do primeiro ao último compasso dela.
  const range3 = await win.locator('.map-row').nth(2).locator('.map-range').innerText();
  await win.locator('.map-row').nth(2).getByRole('button', { name: /em loop/ }).click();
  await win.waitForTimeout(500);
  const loopLabel = await win.getByRole('button', { name: /^Loop \d/ }).getAttribute('aria-label');
  const [, a3, b3] = range3.match(/(\d+)–(\d+)/);
  check(loopLabel === `Loop ${a3}–${b3}` && (await win.getByRole('button', { name: 'Pausar' }).count()) === 1, `loop da parte: ${loopLabel}, tocando`);
  await win.getByRole('button', { name: 'Pausar' }).click();
  const first = win.locator('.map-name').first();
  await first.fill('Abertura');
  await first.press('Enter');
  await win.waitForTimeout(300);
  check((await win.locator('.rsec').first().innerText()).toLowerCase().includes('abertura'), 'renomear a parte atualiza a régua');
  if (shot) await win.screenshot({ path: shot.replace(/\.png$/, '-mapa.png') });
  const saveTo = (file) => app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, file);
  const pdfOut = join(userData, 'mapa.pdf');
  await saveTo(pdfOut);
  await win.getByRole('button', { name: 'Exportar PDF' }).click();
  await win.getByText(/Mapa exportado em PDF/).waitFor({ timeout: 30000 });
  const pdf = readFileSync(pdfOut);
  check(pdf.toString('ascii', 0, 4) === '%PDF' && pdf.length > 5000, `mapa em PDF (${Math.round(pdf.length / 1024)} KB)`);
  const txtOut = join(userData, 'mapa.txt');
  await saveTo(txtOut);
  await win.getByRole('button', { name: /Texto/ }).click();
  await win.getByText(/Mapa exportado em texto/).waitFor({ timeout: 30000 });
  const txt = readFileSync(txtOut, 'utf8');
  check(txt.includes('ABERTURA  (compassos 1–') && /\| \d+: /.test(txt), 'mapa em texto com partes e compassos');
  console.log(txt.slice(0, 900));
  // O nome editado fica salvo na biblioteca
  const saved = JSON.parse(readFileSync(join(userData, 'library', 'index.json'), 'utf8')).songs[0].sections;
  check(saved?.[0]?.name === 'Abertura', 'mapa salvo na música');
} finally {
  await app.close();
}
