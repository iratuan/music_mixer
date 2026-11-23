import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIXER_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, '../../docs/screens');

async function run() {
  console.log('Iniciando captura do MixerMonster via Playwright Electron...');
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const app = await electron.launch({
    args: ['.'],
    cwd: MIXER_DIR,
  });

  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForLoadState('networkidle');
  await win.waitForTimeout(1000); // aguardar splash desaparecer

  // 1. Biblioteca - Escuro
  await win.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(OUT_DIR, 'mixermonster-library-dark.png'), fullPage: false });
  console.log('Capturado: mixermonster-library-dark.png');

  // 2. Biblioteca - Claro
  await win.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(OUT_DIR, 'mixermonster-library-light.png'), fullPage: false });
  console.log('Capturado: mixermonster-library-light.png');

  // Voltar para escuro
  await win.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await win.waitForTimeout(200);

  // 3. Tela de Importação
  try {
    const importTab = await win.$('button:has-text("Importar"), nav a:has-text("Importar"), [data-tab="import"]');
    if (importTab) {
      await importTab.click();
      await win.waitForTimeout(600);
      await win.screenshot({ path: path.join(OUT_DIR, 'mixermonster-import-dark.png'), fullPage: false });
      console.log('Capturado: mixermonster-import-dark.png');
    }
  } catch (err) {
    console.warn('Import tab:', err.message);
  }

  // 4. Se houver alguma música na biblioteca, abrir para capturar a mesa de som / mixer de stems
  try {
    const libTab = await win.$('button:has-text("Biblioteca"), nav a:has-text("Biblioteca")');
    if (libTab) await libTab.click();
    await win.waitForTimeout(400);

    const firstSong = await win.$('.song-card, .track-item, [role="button"]:has-text("Abrir"), .library-item');
    if (firstSong) {
      await firstSong.click();
      await win.waitForTimeout(800);
      await win.screenshot({ path: path.join(OUT_DIR, 'mixermonster-mixer-dark.png'), fullPage: false });
      console.log('Capturado: mixermonster-mixer-dark.png');

      await win.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await win.waitForTimeout(300);
      await win.screenshot({ path: path.join(OUT_DIR, 'mixermonster-mixer-light.png'), fullPage: false });
      console.log('Capturado: mixermonster-mixer-light.png');
    }
  } catch (err) {
    console.warn('Mixer tab:', err.message);
  }

  await app.close();
  console.log('MixerMonster capturado com sucesso!');
}

run().catch((err) => {
  console.error('Erro na captura do MixerMonster:', err);
  process.exit(1);
});
