import { chromium } from 'playwright';

async function captureApp(url, outputPath) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outputPath, fullPage: true });
  await browser.close();
}

const args = process.argv.slice(2);
const url = args[0] || 'http://localhost:3000';
const output = args[1] || 'screenshot.png';

captureApp(url, output).catch(e => {
  console.error('Erro ao capturar:', e.message);
  process.exit(1);
});
