#!/usr/bin/env node
/**
 * Fluxo real do modelo de voz no app EMPACOTADO (copiado para fora do projeto: só o runtime
 * embutido, CPU): importar um trecho, escolher "Principal e backing", ver o cartão de 913 MB,
 * baixar o modelo de verdade (SHA-256 conferido), separar e conferir Voz principal e Backing.
 * Uso: node tooling/screens/voice-download-check.mjs <pasta do app> <áudio curto com voz> [captura.png]
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const [dir, audio, shot] = process.argv.slice(2);
if (!dir || !audio) throw new Error('uso: voice-download-check.mjs <pasta do app> <áudio> [captura.png]');
const userData = mkdtempSync(join(tmpdir(), 'bf-voicedl-'));
const check = (cond, msg) => {
  if (!cond) throw new Error(`verificação falhou: ${msg}`);
  console.log(`ok: ${msg}`);
};
const app = await electron.launch({ executablePath: join(dir, 'Baixaria Fina.exe'), env: { ...process.env, BF_STEMS_PYTHON: '', BF_USER_DATA: userData, BF_AUDIO_SINK: 'none' } });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.setViewportSize({ width: 1280, height: 820 });
  const st = await win.evaluate(() => window.baixaria.stemsAvailable());
  check(st.runtime === 'cpu' && !st.voiceSplit, 'app empacotado: runtime de CPU, modelo de voz ainda não instalado');
  const nav = win.getByRole('navigation', { name: 'Navegação principal' });
  await nav.getByRole('button', { name: 'Importar', exact: true }).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, audio);
  await win.getByRole('button', { name: /Escolher arquivo de música/ }).click();
  await win.getByRole('group', { name: 'Faixas a separar' }).waitFor({ timeout: 30000 });
  await win.getByRole('radio', { name: 'Principal e backing' }).click();
  const card = win.getByRole('group', { name: 'Modelo de voz' });
  await card.waitFor();
  check(/913 MB/.test(await card.innerText()), 'cartão explica o download de 913 MB');
  check(await win.getByRole('button', { name: 'Separar faixas' }).isDisabled(), '"Separar" espera o modelo');
  const t0 = Date.now();
  await card.getByRole('button', { name: 'Baixar modelo' }).click();
  await win.getByText(/Baixando o modelo de voz · \d+ MB/).waitFor({ timeout: 60000 });
  check(true, 'progresso do download com MB');
  if (shot) await win.screenshot({ path: shot.replace(/\.png$/, '-download.png') });
  await card.waitFor({ state: 'detached', timeout: 1800000 });
  const secs = (Date.now() - t0) / 1000;
  const model = join(userData, 'models', 'voice');
  const files = existsSync(model) ? readdirSync(model) : [];
  check(files.some((f) => f.endsWith('.ckpt')) && files.some((f) => f.endsWith('.yaml')) && !files.some((f) => f.endsWith('.part')), `modelo baixado e conferido em ${secs.toFixed(0)} s (${files.join(', ')})`);
  check((await win.evaluate(() => window.baixaria.stemsAvailable())).voiceSplit, 'app reconhece o modelo instalado');
  await win.getByRole('button', { name: 'Separar faixas' }).click();
  const t1 = Date.now();
  await win.locator('.lane').first().waitFor({ timeout: 3600000 });
  const names = await win.locator('.lane .lane-title > span:not(.lane-num)').allInnerTexts();
  check(names.includes('Voz principal') && names.includes('Backing vocals'), `faixas: ${names.join(', ')} (separação em ${((Date.now() - t1) / 1000).toFixed(0)} s, CPU)`);
  const song = readdirSync(join(userData, 'library', 'songs'))[0];
  const faixas = join(userData, 'library', 'songs', song, 'faixas');
  const lead = readdirSync(faixas).find((f) => f.startsWith('lead.'));
  check(lead === 'lead.flac' && statSync(join(faixas, lead)).size > 10_000, `voz principal gravada em FLAC (${lead})`);
  if (shot) await win.screenshot({ path: shot });
} finally {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
}
