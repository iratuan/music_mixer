#!/usr/bin/env node
/**
 * Roteiro de ponta a ponta da importação pelo link de um vídeo, SEM internet:
 * o yt-dlp é substituído por tooling/screens/fake-ytdlp.mjs (BF_YTDLP), que entrega a fixture.
 * A separação (Demucs) e a análise são reais. Biblioteca isolada.
 *
 * Uso: npm run build && node tooling/screens/url-import.mjs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'docs', 'screens');
const fixture = join(root, 'tests', 'fixtures', 'midi-synth', 'bass-common-clean.wav');
const tmp = join(tmpdir(), 'baixaria-fina-e2e-url');
const userData = join(tmp, 'userData');
const log = join(tmp, 'fake-ytdlp.log');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(outDir, { recursive: true });

const app = await electron.launch({
  args: [root],
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    BF_USER_DATA: userData,
    BF_AUDIO_SINK: 'none',
    BF_YTDLP: join(root, 'tooling', 'screens', 'fake-ytdlp.mjs'),
    BF_FAKE_AUDIO: fixture,
    BF_FAKE_LOG: log,
  },
});
const check = (cond, msg) => {
  if (!cond) throw new Error(`verificação falhou: ${msg}`);
  console.log(`ok: ${msg}`);
};
const songsDir = join(userData, 'library', 'songs');
const songFolders = () => (existsSync(songsDir) ? readdirSync(songsDir) : []);
const URL_OK = 'https://videos.exemplo.org/watch?v=livre1';

try {
  const win = await app.firstWindow();
  const muted = async (lane) => (await win.getByRole('button', { name: `Mudo em ${lane}` }).getAttribute('aria-pressed')) === 'true';
  await win.waitForLoadState('load');
  await win.setViewportSize({ width: 1280, height: 820 });
  await win.evaluate(() => localStorage.clear());
  await win.reload();
  const nav = win.getByRole('navigation', { name: 'Navegação principal' });

  // 1. Aviso de uso responsável, uma vez
  await nav.getByRole('button', { name: 'Importar', exact: true }).click();
  await win.getByRole('tab', { name: /Link de vídeo/ }).click();
  await win.getByRole('region', { name: 'Uso responsável' }).waitFor();
  check(true, 'aviso de uso responsável na primeira vez');
  await win.screenshot({ path: join(outDir, '09-link-aviso.png') });
  await win.getByRole('button', { name: 'Entendi' }).click();
  await win.getByText(/Baixador yt-dlp 2026\.10\.26-teste/).waitFor();
  check(true, 'versão do baixador exibida');
  await nav.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await nav.getByRole('button', { name: 'Importar', exact: true }).click();
  check((await win.getByRole('region', { name: 'Uso responsável' }).count()) === 0, 'aviso não volta (e a aba Link fica lembrada)');

  // 2. Erros claros
  const input = win.getByLabel('Link do vídeo');
  await input.fill('http://127.0.0.1/video');
  await win.getByRole('button', { name: 'Buscar' }).click();
  await win.getByRole('alert').filter({ hasText: /https/ }).waitFor();
  check(true, 'link sem https é recusado');
  await input.fill('https://videos.exemplo.org/watch?v=login');
  await win.getByRole('button', { name: 'Buscar' }).click();
  await win.getByRole('alert').filter({ hasText: /login|conta/ }).waitFor({ timeout: 30000 });
  check(true, 'vídeo que exige login: motivo claro');
  await input.fill('https://videos.exemplo.org/watch?v=longo');
  await win.getByRole('button', { name: 'Buscar' }).click();
  await win.getByText(/limite é (de )?20 min/).waitFor({ timeout: 30000 });
  check(true, 'vídeo acima de 20 min é recusado');

  // 3. Cancelar no meio do download apaga os parciais
  await input.fill('https://videos.exemplo.org/watch?v=lento');
  await win.getByRole('button', { name: 'Buscar' }).click();
  await win.getByLabel('Prévia do vídeo').waitFor({ timeout: 30000 });
  await win.getByLabel('Separar as faixas depois de baixar').uncheck();
  await win.getByRole('button', { name: 'Baixar', exact: true }).click();
  await win.getByRole('progressbar', { name: /Baixando/ }).waitFor();
  await win.waitForTimeout(1500);
  check(songFolders().length === 1, 'download grava na pasta da música');
  await win.getByRole('button', { name: 'Cancelar' }).click();
  await win.getByLabel('Link do vídeo').waitFor({ timeout: 15000 });
  await win.waitForTimeout(500);
  check(songFolders().length === 0, 'cancelar encerra e apaga os arquivos parciais');

  // 4. Prévia, formato, faixas e estado inicial (baixo mudo)
  await input.fill(URL_OK);
  await win.getByRole('button', { name: 'Buscar' }).click();
  const preview = win.getByLabel('Prévia do vídeo');
  await preview.getByText('Linha de baixo livre (teste)').waitFor({ timeout: 30000 });
  check((await preview.innerText()).includes('Canal de Teste · videos.exemplo.org'), 'prévia com título, canal e site');
  await preview.getByRole('radio', { name: 'WAV' }).click();
  await win.getByLabel('Separar as faixas depois de baixar').check();
  const picker = win.getByRole('group', { name: 'Faixas a separar' });
  for (const t of ['Guitarra', 'Piano', 'Outros']) await picker.locator('.sp-section').first().getByText(t).click();
  await picker.getByRole('radio', { name: 'Não separar' }).click();
  await picker.getByRole('button', { name: 'Rápida' }).click();
  const start = win.getByRole('group', { name: 'Começar tocando' });
  const startNames = await start.locator('.sp-chip').allInnerTexts();
  check(startNames.map((t) => t.split('\n')[0].replace(/ativa|muda/, '').trim()).join(',') === 'Baixo,Bateria,Restante', `começar tocando lista as faixas escolhidas: ${startNames.join(' | ').replace(/\n/g, ' ')}`);
  await start.getByLabel('Baixo: ativa').uncheck();
  check(await start.getByLabel('Baixo: muda').isVisible(), 'baixo marcado para começar mudo');
  await win.screenshot({ path: join(outDir, '10-link-previa.png') });
  await picker.getByRole('button', { name: 'Baixar e separar' }).click();
  await win.getByRole('progressbar', { name: /Baixando|Convertendo/ }).waitFor();
  await win.screenshot({ path: join(outDir, '11-link-baixando.png') });
  check(true, 'progresso do download em etapas');

  // 5. Separação na fila e player abrindo com o baixo mudo
  await win.locator('.lane').first().waitFor({ timeout: 600000 });
  const names = await win.locator('.lane .lane-title > span:not(.lane-num)').allInnerTexts();
  check(names.slice(0, 3).join(',') === 'Baixo,Bateria,Restante', `faixas no player: ${names.join(', ')}`);
  check(await muted('Baixo'), 'baixo começa mudo');
  check(!(await muted('Bateria')), 'bateria começa tocando');
  const args = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const dl = args.findLast((a) => a.includes('--extract-audio'));
  check(dl && dl.includes('--ignore-config') && dl.includes('--no-cookies') && dl[dl.length - 2] === '--' && dl[dl.length - 1] === URL_OK && dl[dl.indexOf('--audio-format') + 1] === 'wav', 'yt-dlp chamado com --ignore-config, sem cookies, link depois de "--", formato WAV');

  // 6. Salvar como padrão
  await win.getByRole('button', { name: 'Mudo em Baixo' }).click();
  await win.getByRole('button', { name: 'Mudo em Bateria' }).click();
  await win.getByRole('button', { name: 'Salvar como padrão' }).click();
  await win.getByText(/a música abre assim/).waitFor();
  const index = JSON.parse(readFileSync(join(userData, 'library', 'index.json'), 'utf8'));
  check(index.songs[0].startMix.bass === true && index.songs[0].startMix.drums === false, 'estado inicial salvo na música');
  check(index.songs[0].origin.kind === 'url' && index.songs[0].origin.url === URL_OK && !!index.songs[0].origin.downloadedAt, 'origem (link e data) guardada');

  // 7. Biblioteca: selo da origem e "Abrir origem" com confirmação
  await win.waitForTimeout(500);
  await nav.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await win.getByRole('button', { name: 'Abrir origem em videos.exemplo.org' }).waitFor({ timeout: 300000 });
  check(true, 'selo do site de origem no cartão');
  await app.evaluate(({ dialog, shell }) => {
    globalThis.__asked = 0;
    globalThis.__opened = null;
    dialog.showMessageBox = async () => (globalThis.__asked++, { response: 0, checkboxChecked: false });
    shell.openExternal = async (u) => {
      globalThis.__opened = u;
    };
  });
  await win.getByRole('button', { name: 'Abrir origem' }).click();
  await win.waitForTimeout(500);
  const opened = await app.evaluate(() => ({ asked: globalThis.__asked, url: globalThis.__opened }));
  check(opened.asked === 1 && opened.url === URL_OK, 'abrir origem pede confirmação e abre o link no navegador');
  // Espera a análise terminar (o cartão ganha o tom) antes da foto.
  await win.locator('.lib-meta', { hasText: 'BPM' }).waitFor({ timeout: 300000 });
  await win.screenshot({ path: join(outDir, '12-biblioteca-origem.png') });

  // 8. Mesmo vídeo de novo: não duplica
  await nav.getByRole('button', { name: 'Importar', exact: true }).click();
  await input.fill(URL_OK);
  await win.getByRole('button', { name: 'Buscar' }).click();
  await win.getByText('Este vídeo já está na biblioteca.').waitFor({ timeout: 30000 });
  check(true, 'mesmo vídeo não é baixado de novo');

  // 9. Remover apaga o áudio baixado
  const folder = songFolders()[0];
  await win.getByRole('button', { name: 'Abrir música' }).click();
  await win.locator('.lane').first().waitFor({ timeout: 60000 });
  check(!(await muted('Baixo')) && (await muted('Bateria')), 'música reabre com o estado salvo');
  await win.getByRole('button', { name: 'Remover' }).click();
  await win.getByRole('button', { name: 'Confirmar remoção' }).click();
  await win.getByRole('heading', { name: 'Biblioteca', level: 1 }).waitFor();
  check(!existsSync(join(songsDir, folder)), 'remover apaga o áudio baixado');
  console.log('roteiro do link de vídeo: tudo ok');
} finally {
  await app.close();
}
