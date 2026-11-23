import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../dist');
const OUT_DIR = path.resolve(__dirname, '../../docs/screens');

function createServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(DIST_DIR, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      const indexPath = path.join(DIST_DIR, 'index.html');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(indexPath).pipe(res);
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function run() {
  console.log('Iniciando captura das telas do ScaleMonster...');
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const { server, url } = await createServer();
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const execPath = fs.existsSync(chromePath) ? chromePath : edgePath;

  const browser = await chromium.launch({
    executablePath: execPath,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // 1. Harmonia (Ciclo das quintas, acordes e base) - Dark e Light
  console.log('Capturando tela de Harmonia...');
  await page.goto(`${url}/?screen=harmony`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: path.join(OUT_DIR, 'scalemonster-harmony-dark.png'), fullPage: false });
  console.log('Capturado: scalemonster-harmony-dark.png');

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, 'scalemonster-harmony-light.png'), fullPage: false });
  console.log('Capturado: scalemonster-harmony-light.png');

  // 2. Prática & Exercícios (Braço 2D, Pista 3D de Arcade Stage, Tablatura)
  console.log('Capturando tela de Prática & Exercícios...');
  await page.goto(`${url}/?screen=exercises`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: path.join(OUT_DIR, 'scalemonster-exercises-dark.png'), fullPage: false });
  console.log('Capturado: scalemonster-exercises-dark.png');

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, 'scalemonster-exercises-light.png'), fullPage: false });
  console.log('Capturado: scalemonster-exercises-light.png');

  // 3. Teoria & Leitura (Teclado de Piano, Braço e Pauta)
  console.log('Capturando tela de Teoria & Piano...');
  await page.goto(`${url}/?screen=theory`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: path.join(OUT_DIR, 'scalemonster-theory-dark.png'), fullPage: false });
  console.log('Capturado: scalemonster-theory-dark.png');

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, 'scalemonster-theory-light.png'), fullPage: false });
  console.log('Capturado: scalemonster-theory-light.png');

  await browser.close();
  server.close();
  console.log('Capturas do ScaleMonster concluídas!');
}

run().catch((err) => {
  console.error('Erro na captura do ScaleMonster:', err);
  process.exit(1);
});
