/**
 * Ciclo de vida dos processos auxiliares (pasta de dados isolada, fixture sintética):
 *   1. cancelar uma separação em andamento: o trabalho some, o Python dela é encerrado;
 *   2. fechar o app no meio de uma separação: nenhum Python fica rodando escondido;
 *   3. segunda instância com a mesma pasta de dados: encerra sozinha;
 *   4. registro (logs/main.log) criado com a linha de início.
 * Uso: node tooling/screens/lifecycle-check.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'tests', 'fixtures', 'midi-synth', 'bass-common-clean.wav');
const userData = join(tmpdir(), 'bf-lifecycle', 'userData');
rmSync(userData, { recursive: true, force: true });
mkdirSync(userData, { recursive: true });
const env = { ...process.env, NODE_ENV: 'production', BF_USER_DATA: userData, BF_AUDIO_SINK: 'none' };
const check = (cond, msg) => {
  if (!cond) throw new Error(`verificação falhou: ${msg}`);
  console.log(`ok: ${msg}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** PIDs de python.exe cuja linha de comando cita a pasta de dados do teste (não mexe em outros). */
function testPythons() {
  const out = execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*bf-lifecycle*' } | ForEach-Object { $_.ProcessId }`], { encoding: 'utf8' });
  return out.split(/\s+/).filter(Boolean).map(Number);
}
async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(250);
  }
  throw new Error(`tempo esgotado: ${what}`);
}

async function startSeparation(app, win, first) {
  if (first) {
    const nav = win.getByRole('navigation', { name: 'Navegação principal' });
    await nav.getByRole('button', { name: 'Importar', exact: true }).click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, fixture);
    await win.getByRole('button', { name: /Escolher arquivo de música/ }).click();
  }
  await win.getByRole('group', { name: 'Faixas a separar' }).waitFor({ timeout: 30000 });
  await win.getByRole('button', { name: 'Separar faixas' }).click();
  await waitFor(() => testPythons().length > 0, 60000, 'Python da separação iniciar');
}

let app = await electron.launch({ args: [root], cwd: root, env });
try {
  let win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.setViewportSize({ width: 1280, height: 820 });

  // 4. registro
  const log = join(userData, 'logs', 'main.log');
  check(existsSync(log) && /início 0\.5\.0/.test(readFileSync(log, 'utf8')), 'registro criado com a versão');

  // 3. segunda instância
  const second = spawn(join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), [root], { env, stdio: 'ignore' });
  const code = await Promise.race([new Promise((r) => second.once('exit', (c) => r(c))), sleep(15000).then(() => 'viva')]);
  if (code === 'viva') second.kill();
  check(code !== 'viva', 'segunda instância encerra sozinha (uma janela só)');

  // 1. cancelar
  await startSeparation(app, win, true);
  const cancel = win.getByRole('button', { name: 'Cancelar', exact: true });
  await cancel.waitFor({ timeout: 30000 });
  check(true, 'botão Cancelar ao lado da barra de separação');
  await cancel.click();
  await waitFor(() => testPythons().length === 0, 20000, 'Python encerrar após cancelar');
  check(true, 'cancelar encerra o Python da separação');
  await win.getByRole('group', { name: 'Faixas a separar' }).waitFor({ timeout: 20000 });
  check((await win.locator('.alert').count()) === 0, 'cancelada sem mensagem de erro; seletor de faixas de volta');

  // 2. fechar no meio
  await startSeparation(app, win, false);
  const pids = testPythons();
  await app.close();
  app = null;
  await waitFor(() => testPythons().length === 0, 20000, 'Python encerrar ao fechar o app');
  check(true, `fechar o app encerra a separação em andamento (${pids.length} processo(s))`);
  check(/encerrados \d+ processos auxiliares ao sair/.test(readFileSync(log, 'utf8')), 'registro anota o encerramento');
} finally {
  if (app) await app.close().catch(() => undefined);
  for (const pid of testPythons()) {
    try {
      process.kill(pid);
    } catch {
      /* já saiu */
    }
  }
}
