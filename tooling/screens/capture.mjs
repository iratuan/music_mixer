#!/usr/bin/env node
/**
 * Percorre o fluxo principal no Electron real (Playwright) e captura as telas.
 * Biblioteca isolada em BF_TMP/userData: nunca toca a biblioteca do usuário.
 *
 * Substituições (só nos diálogos nativos, no processo principal):
 *   - "Importar" devolve a fixture tests/fixtures/midi-synth/bass-common-clean.wav
 *   - "Salvar" devolve arquivos em BF_TMP
 *
 * Uso: npm run build && node tooling/screens/capture.mjs
 * BF_SPLIT_VOICE=1 também testa a divisão de voz (modelo de karaokê, mais lento).
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'docs', 'screens');
const fixture = join(root, 'tests', 'fixtures', 'midi-synth', 'bass-common-clean.wav');
const tmp = process.env.BF_TMP ?? join(tmpdir(), 'baixaria-fina-e2e');
const userData = join(tmp, 'userData');
rmSync(userData, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(tmp, { recursive: true });
const splitVoice = process.env.BF_SPLIT_VOICE === '1';

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, NODE_ENV: 'production', BF_USER_DATA: userData, BF_AUDIO_SINK: 'none' } });
const check = (cond, msg) => {
  if (!cond) throw new Error(`verificação falhou: ${msg}`);
  console.log(`ok: ${msg}`);
};
const saveTo = (file) =>
  app.evaluate(({ dialog }, f) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: f });
  }, file);

try {
  const win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.setViewportSize({ width: 1280, height: 820 });
  await win.evaluate(() => localStorage.clear());
  const nav = win.getByRole('navigation', { name: 'Navegação principal' });

  // 1. Biblioteca vazia → Importar
  await win.getByRole('heading', { name: 'Biblioteca', level: 1 }).waitFor();
  check((await nav.getByRole('button').allInnerTexts()).every((t) => !/Pista|Análise|Estúdio/.test(t)), 'menu sem as telas removidas (Pista, Análise, Estúdio)');
  await win.screenshot({ path: join(outDir, '01-biblioteca-vazia.png') });
  await nav.getByRole('button', { name: 'Importar', exact: true }).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, fixture);
  await win.getByRole('button', { name: /Escolher arquivo de música/ }).click();

  // 2. A música abre direto no seletor de faixas
  const picker = win.getByRole('group', { name: 'Faixas a separar' });
  await picker.waitFor();
  check(true, 'importar abre o seletor de faixas');
  await picker.getByText('Guitarra').click(); // desmarca
  await picker.getByText('Piano').click(); // desmarca
  if (splitVoice) await win.getByRole('radio', { name: 'Principal e backing' }).click();
  await win.getByText(/na faixa "Restante"/).waitFor();
  check(true, 'faixas desmarcadas vão para "Restante"');
  await win.screenshot({ path: join(outDir, '02-escolher-faixas.png') });
  await win.getByRole('button', { name: 'Separar faixas' }).click();
  await win.getByText(/Separando com o Demucs|Na fila/).first().waitFor({ timeout: 30000 });
  check(true, 'separação começou');

  // 3. Player: faixas + análise
  await win.locator('.lane').first().waitFor({ timeout: 600000 });
  await win.locator('.song-facts .fact.key').waitFor({ timeout: 300000 });
  await win.locator('.lane.stem-metro').waitFor();
  const laneNames = await win.locator('.lane .lane-title > span:not(.lane-num)').allInnerTexts();
  const expected = splitVoice ? ['Voz principal', 'Backing vocals', 'Baixo', 'Bateria', 'Outros', 'Restante', 'Metrônomo'] : ['Voz', 'Baixo', 'Bateria', 'Outros', 'Restante', 'Metrônomo'];
  check(JSON.stringify(laneNames) === JSON.stringify(expected), `faixas escolhidas + restante + metrônomo: ${laneNames.join(', ')}`);
  const fill = await win.evaluate(() => {
    const sc = document.querySelector('.tl-scroll');
    const rows = [...document.querySelectorAll('.tl-row')].reduce((a, r) => a + r.getBoundingClientRect().height, 0);
    return sc.scrollHeight > sc.clientHeight + 1 ? 99 : rows / sc.clientHeight;
  });
  check(fill > 0.99 && fill < 1.01, `faixas ocupam a área da linha do tempo (${Math.round(fill * 100)}%)`);
  const keyText = await win.locator('.song-facts .fact.key b').innerText();
  check(/^[A-G][#b]? (maior|menor)$/.test(keyText), `tom da música exibido: ${keyText}`);
  await win.screenshot({ path: join(outDir, '03-player.png') });

  // 4. Tocar: painel inferior com compasso e acorde
  await win.getByRole('button', { name: 'Tocar' }).click();
  await win.locator('.dock').waitFor();
  await win.waitForTimeout(5000);
  const bar1 = Number(await win.locator('.dock-big').first().innerText());
  await win.waitForTimeout(4000);
  const bar2 = Number(await win.locator('.dock-big').first().innerText());
  check(bar2 > bar1, `painel inferior acompanha o compasso (${bar1} → ${bar2})`);
  await win.locator('.bass-neck').waitFor({ timeout: 120000 });
  check(true, 'notas do baixo no braço do painel');
  await win.screenshot({ path: join(outDir, '04-tocando.png') });

  // 5. Solo e liga/desliga ao vivo
  await win.getByRole('button', { name: 'Solo em Baixo' }).click();
  check((await win.locator('.lane.silent').count()) >= 4, 'solo no baixo silencia as outras faixas');
  await win.getByRole('button', { name: 'Tirar solos' }).click();
  await win.getByRole('button', { name: 'Mudo em Bateria' }).click();
  check(await win.locator('.lane.stem-drums.silent').isVisible(), 'bateria muda (M) durante a música');
  await win.keyboard.press('Digit3');
  check(!(await win.locator('.lane.stem-drums.silent').isVisible()), 'tecla 3 tira o mudo da bateria');
  // Knob de volume: setas do teclado, duplo clique volta ao padrão; pan entra no áudio.
  const vol = win.getByRole('slider', { name: 'Volume de Baixo' });
  await vol.focus();
  for (let i = 0; i < 5; i++) await win.keyboard.press('ArrowDown');
  check(Number(await vol.getAttribute('aria-valuenow')) < 0.8, `knob de volume responde ao teclado (${await vol.getAttribute('aria-valuetext')})`);
  await vol.dblclick();
  check(Number(await vol.getAttribute('aria-valuenow')) === 0.8, 'duplo clique volta o volume ao padrão');
  const pan = win.getByRole('slider', { name: 'Pan de Baixo' });
  const box = await pan.boundingBox();
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.down();
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 6 });
  await win.screenshot({ path: join(outDir, '04b-knob-arrastando.png') });
  await win.mouse.up();
  check(Number(await pan.getAttribute('aria-valuenow')) > 0.5, `arrastar o knob de pan: ${await pan.getAttribute('aria-valuetext')}`);
  await pan.dblclick();

  // 6. Metrônomo e transposição
  await win.locator('.transport-bar').getByRole('button', { name: /Metrônomo/ }).click();
  check((await win.getByRole('button', { name: 'Metrônomo mudo' }).getAttribute('aria-pressed')) === 'false', 'metrônomo ligado');
  await win.getByRole('button', { name: 'Subir meio tom' }).click();
  await win.locator('.tone-value', { hasText: '+1 semitom' }).waitFor({ timeout: 300000 });
  await win.locator('.lane').first().waitFor({ timeout: 120000 });
  const after = await win.locator('.song-facts .fact.key b').innerText();
  check(after !== keyText, `transposição +1: ${keyText} → ${after}`);
  await win.screenshot({ path: join(outDir, '05-transposto.png') });
  const pauseBtn = win.getByRole('button', { name: 'Pausar' });
  if (await pauseBtn.isVisible()) await pauseBtn.click();

  // 7. Exportar WAV e MIDI do baixo
  const wavOut = join(tmp, 'baixo.wav');
  await saveTo(wavOut);
  await win.getByRole('button', { name: 'Exportar Baixo em WAV' }).click();
  await win.getByText(/Baixo exportada em WAV/).waitFor({ timeout: 60000 });
  check(readFileSync(wavOut).toString('ascii', 0, 4) === 'RIFF', 'baixo exportado em WAV');
  const midOut = join(tmp, 'baixo.mid');
  await saveTo(midOut);
  await win.getByRole('button', { name: 'Exportar Baixo em MIDI' }).click();
  await win.getByText(/Baixo exportada em MIDI/).waitFor({ timeout: 300000 });
  check(readFileSync(midOut).toString('ascii', 0, 4) === 'MThd', 'baixo exportado em MIDI');

  // 7b. Mixagem só com as faixas marcadas (baixo fora)
  const mixBtn = win.getByRole('button', { name: /Exportar mixagem/ });
  const nAll = Number(await mixBtn.locator('.count-pill').innerText());
  await win.getByRole('checkbox', { name: 'Incluir Baixo na mixagem' }).click();
  check(Number(await mixBtn.locator('.count-pill').innerText()) === nAll - 1, `desmarcar o baixo tira uma faixa da mixagem (${nAll} → ${nAll - 1})`);
  await win.screenshot({ path: join(outDir, '05b-mixagem-marcada.png') });
  const mixOut = join(tmp, 'mix.wav');
  await saveTo(mixOut);
  await mixBtn.click();
  await win.getByText(/Mixagem exportada em WAV/).waitFor({ timeout: 60000 });
  const mixMsg = await win.getByText(/Mixagem exportada em WAV/).innerText();
  const mixWav = readFileSync(mixOut);
  check(mixWav.toString('ascii', 0, 4) === 'RIFF' && mixWav.readUInt16LE(22) === 2 && !mixMsg.includes('Baixo'), `mixagem estéreo sem o baixo: ${mixMsg}`);
  await win.getByRole('checkbox', { name: 'Incluir Baixo na mixagem' }).click();

  // 8. Biblioteca e temas
  await nav.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await win.locator('.lib-card').first().waitFor();
  check((await win.locator('.lib-card .lib-meta').first().innerText()).includes('BPM'), 'biblioteca mostra tom e BPM');
  await win.screenshot({ path: join(outDir, '06-biblioteca.png') });
  for (const t of ['Claro', 'Madeira', 'Papel', 'Escuro']) {
    await win.getByRole('radio', { name: t }).click();
    await nav.getByRole('button', { name: /bass-common-clean/ }).click();
    await win.locator('.lane').first().waitFor();
    await win.getByRole('button', { name: 'Tocar' }).click();
    await win.waitForTimeout(1500);
    await win.getByRole('button', { name: 'Pausar' }).click();
    await win.screenshot({ path: join(outDir, `07-tema-${t.toLowerCase()}.png`) });
    await nav.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  }
  check(true, 'quatro temas capturados');

  // 9. Exercícios (motor do ScaleMonster)
  await nav.getByRole('button', { name: 'Exercícios', exact: true }).click();
  await win.locator('.ex-neck').waitFor();
  await win.getByLabel('Exercício').selectOption({ label: '15. Saltos de oitava' });
  await win.getByLabel('Região').selectOption({ label: 'Braço inteiro' });
  check((await win.locator('.ex-pill').count()) > 10, 'exercício de oitavas no braço inteiro montado');
  await win.getByRole('button', { name: 'Começar' }).click();
  await win.waitForTimeout(4000);
  check((await win.locator('.ex-pill.now').count()) === 1, 'sequência tocando com a nota atual marcada');
  await win.screenshot({ path: join(outDir, '08-exercicios.png') });
  await win.getByRole('button', { name: 'Parar' }).click();
} finally {
  await app.close();
}
console.log(`Capturas em ${outDir}`);
